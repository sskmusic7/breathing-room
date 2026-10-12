"""Revolut Business API client (sandbox) for paying creditors in GBP.

The pot settles each creditor's share on-chain; this sends the same amount
as a real UK bank transfer to the creditor's sort code + account number,
carrying the creditor's own reference (PCN / account number) so they can
match it.

Auth: one-time consent in the Revolut dashboard ("Enable access") redirects
to /payouts/revolut/callback with a code; we exchange it using an RS256
client-assertion JWT signed with our private key, then keep the refresh
token. Access tokens last ~40 minutes.
"""
from __future__ import annotations

import base64
import json
import os
import time
import urllib.parse
from pathlib import Path

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

BASE_URL = os.environ.get("REVOLUT_BASE_URL", "https://sandbox-b2b.revolut.com/api/1.0")
STATE_PATH = Path(os.environ.get("REVOLUT_STATE_PATH", "/app/state/revolut.json"))


class RevolutError(RuntimeError):
    pass


def configured() -> bool:
    return bool(os.environ.get("REVOLUT_CLIENT_ID") and os.environ.get("REVOLUT_PRIVATE_KEY_PATH"))


def connected() -> bool:
    return configured() and bool(_state().get("refresh_token"))


def _state() -> dict:
    return json.loads(STATE_PATH.read_text()) if STATE_PATH.exists() else {}


def _save_state(**fields) -> None:
    state = {**_state(), **fields}
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2))


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _client_assertion() -> str:
    redirect = os.environ.get("REVOLUT_REDIRECT_URI", "https://breathing-api.178-62-45-130.sslip.io/payouts/revolut/callback")
    header = {"alg": "RS256", "typ": "JWT"}
    claims = {
        "iss": urllib.parse.urlparse(redirect).netloc,
        "sub": os.environ["REVOLUT_CLIENT_ID"],
        "aud": "https://revolut.com",
        "exp": int(time.time()) + 300,
    }
    signing_input = f"{_b64url(json.dumps(header).encode())}.{_b64url(json.dumps(claims).encode())}"
    key = serialization.load_pem_private_key(Path(os.environ["REVOLUT_PRIVATE_KEY_PATH"]).read_bytes(), password=None)
    signature = key.sign(signing_input.encode(), padding.PKCS1v15(), hashes.SHA256())
    return f"{signing_input}.{_b64url(signature)}"


def _token(data: dict) -> dict:
    data = {
        **data,
        "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        "client_assertion": _client_assertion(),
    }
    resp = httpx.post(f"{BASE_URL}/auth/token", data=data, timeout=20)
    if resp.status_code >= 400:
        raise RevolutError(f"Revolut token -> {resp.status_code}: {resp.text[:300]}")
    return resp.json()


def exchange_code(code: str) -> None:
    tokens = _token({"grant_type": "authorization_code", "code": code})
    _save_state(
        refresh_token=tokens["refresh_token"],
        access_token=tokens["access_token"],
        expires_at=time.time() + int(tokens.get("expires_in", 2400)) - 60,
    )


def _access_token() -> str:
    state = _state()
    if state.get("access_token") and state.get("expires_at", 0) > time.time():
        return state["access_token"]
    if not state.get("refresh_token"):
        raise RevolutError("Revolut not connected yet")
    tokens = _token({"grant_type": "refresh_token", "refresh_token": state["refresh_token"]})
    _save_state(access_token=tokens["access_token"], expires_at=time.time() + int(tokens.get("expires_in", 2400)) - 60)
    return tokens["access_token"]


def _request(method: str, path: str, body: dict | None = None) -> dict | list:
    resp = httpx.request(
        method, f"{BASE_URL}{path}", json=body, headers={"Authorization": f"Bearer {_access_token()}"}, timeout=30
    )
    if resp.status_code >= 400:
        raise RevolutError(f"Revolut {method} {path} -> {resp.status_code}: {resp.text[:400]}")
    return resp.json() if resp.content else {}


def gbp_account_id() -> str:
    state = _state()
    if state.get("gbp_account_id"):
        return state["gbp_account_id"]
    accounts = [a for a in _request("GET", "/accounts") if a.get("currency") == "GBP" and a.get("state") == "active"]
    if not accounts:
        raise RevolutError("No active GBP account in Revolut")
    best = max(accounts, key=lambda a: float(a.get("balance", 0)))
    _save_state(gbp_account_id=best["id"])
    return best["id"]


def counterparty_id(name: str, sort_code: str, account_no: str, address: str = "", city: str = "", postcode: str = "") -> str:
    """Creates (once) and caches a UK GBP business counterparty. Revolut
    requires a postal address for UK business payees (from the creditor's letter)."""
    key = f"{sort_code}:{account_no}"
    cache = _state().get("counterparties", {})
    if key in cache:
        return cache[key]
    created = _request(
        "POST",
        "/counterparty",
        {
            "profile_type": "business",
            "company_name": name,
            "bank_country": "GB",
            "currency": "GBP",
            "sort_code": sort_code.replace("-", ""),
            "account_no": account_no,
            "address": {
                "street_line1": address or name,
                "city": city or "London",
                "country": "GB",
                "postcode": postcode,
            },
        },
    )
    _save_state(counterparties={**cache, key: created["id"]})
    return created["id"]


def pay(counterparty: str, amount_gbp: float, reference: str, request_id: str) -> dict:
    """request_id makes the payment idempotent: the same on-chain payout
    can never be paid out twice in GBP."""
    return _request(
        "POST",
        "/pay",
        {
            "request_id": request_id[:40],
            "account_id": gbp_account_id(),
            "receiver": {"counterparty_id": counterparty},
            "amount": round(amount_gbp, 2),
            "currency": "GBP",
            "reference": reference[:140],
        },
    )


def sandbox_topup(amount_gbp: float) -> dict:
    return _request(
        "POST", "/sandbox/topup", {"account_id": gbp_account_id(), "amount": amount_gbp, "currency": "GBP", "reference": "Breathing Room demo float"}
    )
