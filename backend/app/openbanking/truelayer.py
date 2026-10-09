"""TrueLayer sandbox client.

Two separate products, both through TrueLayer as the FCA-authorised provider
(see docs/regulatory_guardrails.md section 3):

- Data API (read-only, AISP): the user links their bank once; we read
  transactions to spot payday and to fill in the SFS budget.
- Payments API v3 (PISP): the user authorises one capped *sweeping* VRP
  mandate (me-to-me: their bank -> their own account at the on-ramp that
  funds their pot); on each payday we take only the surplus over it.
  Sweeping works in sandbox without TrueLayer sales enabling commercial VRP
  or a merchant account.

Payments requests must carry a `Tl-Signature` (detached JWS, ES512). The
official `truelayer-signing` package pins a cryptography version that won't
build here, so the documented v2 scheme is implemented directly below:
https://github.com/TrueLayer/truelayer-signing/blob/main/request-signing-v2.md
"""
from __future__ import annotations

import base64
import json
import os
import time
import urllib.parse
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

AUTH_URL = "https://auth.truelayer-sandbox.com"
API_URL = "https://api.truelayer-sandbox.com"
HPP_URL = "https://payment.truelayer-sandbox.com"

DATA_SCOPES = "info accounts balance transactions offline_access"
PAYMENTS_SCOPES = "payments recurring_payments:sweeping"
# uk-cs-mock = TrueLayer's fictitious Mock Bank, so it shows up in sandbox.
DATA_PROVIDERS = "uk-cs-mock uk-ob-all uk-oauth-all"
VRP_PROVIDER = "ob-uki-mock-bank-sbox"


class TrueLayerNotConfigured(RuntimeError):
    pass


class TrueLayerError(RuntimeError):
    pass


def _env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise TrueLayerNotConfigured(f"{name} is not set")
    return value


def data_configured() -> bool:
    """Bank linking + payday detection (Data API is self-serve in sandbox)."""
    return all(os.environ.get(n) for n in ("TRUELAYER_CLIENT_ID", "TRUELAYER_CLIENT_SECRET", "TRUELAYER_DATA_REDIRECT_URI"))


def payments_configured() -> bool:
    """VRP collection (Payments API is sales-gated on TrueLayer)."""
    return data_configured() and all(
        os.environ.get(n)
        for n in ("TRUELAYER_SIGNING_KEY_ID", "TRUELAYER_SIGNING_KEY_PATH")
    )


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def tl_signature(method: str, path: str, idempotency_key: str, body: str, kid: str, private_pem: bytes) -> str:
    """Detached JWS (ES512) over METHOD path / Idempotency-Key header / body."""
    header = {"alg": "ES512", "kid": kid, "tl_version": "2", "tl_headers": "Idempotency-Key"}
    payload = f"{method.upper()} {path.rstrip('/')}\nIdempotency-Key: {idempotency_key}\n{body}"
    header_b64 = _b64url(json.dumps(header, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{_b64url(payload.encode())}".encode()

    key = serialization.load_pem_private_key(private_pem, password=None)
    if not isinstance(key, ec.EllipticCurvePrivateKey):
        raise TrueLayerError("Signing key must be an EC P-521 private key")
    r, s = decode_dss_signature(key.sign(signing_input, ec.ECDSA(hashes.SHA512())))
    signature = r.to_bytes(66, "big") + s.to_bytes(66, "big")
    return f"{header_b64}..{_b64url(signature)}"


def _check(resp: httpx.Response) -> dict:
    if resp.status_code >= 400:
        raise TrueLayerError(f"TrueLayer {resp.request.method} {resp.request.url.path} -> {resp.status_code}: {resp.text[:500]}")
    return resp.json() if resp.content else {}


# ---------------------------------------------------------------- Data API


def data_auth_link(state: str) -> str:
    params = {
        "response_type": "code",
        "client_id": _env("TRUELAYER_CLIENT_ID"),
        "scope": DATA_SCOPES,
        "redirect_uri": _env("TRUELAYER_DATA_REDIRECT_URI"),
        "providers": DATA_PROVIDERS,
        "state": state,
    }
    return f"{AUTH_URL}/?{urllib.parse.urlencode(params, quote_via=urllib.parse.quote)}"


def _token_request(data: dict) -> dict:
    data = {"client_id": _env("TRUELAYER_CLIENT_ID"), "client_secret": _env("TRUELAYER_CLIENT_SECRET"), **data}
    tokens = _check(httpx.post(f"{AUTH_URL}/connect/token", data=data, timeout=20))
    tokens["expires_at"] = time.time() + int(tokens.get("expires_in", 3600)) - 60
    return tokens


def exchange_code(code: str) -> dict:
    return _token_request(
        {"grant_type": "authorization_code", "code": code, "redirect_uri": _env("TRUELAYER_DATA_REDIRECT_URI")}
    )


def refresh_data_tokens(tokens: dict) -> dict:
    """Returns fresh tokens if the access token has expired, else the same dict."""
    if tokens.get("expires_at", 0) > time.time():
        return tokens
    fresh = _token_request({"grant_type": "refresh_token", "refresh_token": tokens["refresh_token"]})
    fresh.setdefault("refresh_token", tokens["refresh_token"])
    return fresh


def get_transactions(access_token: str, days: int = 35) -> list[dict]:
    """All transactions across the user's linked accounts for the last `days` days."""
    headers = {"Authorization": f"Bearer {access_token}"}
    accounts = _check(httpx.get(f"{API_URL}/data/v1/accounts", headers=headers, timeout=20)).get("results", [])
    now = datetime.now(timezone.utc)
    params = {"from": (now - timedelta(days=days)).isoformat(), "to": now.isoformat()}
    transactions: list[dict] = []
    for account in accounts:
        url = f"{API_URL}/data/v1/accounts/{account['account_id']}/transactions"
        results = _check(httpx.get(url, headers=headers, params=params, timeout=20)).get("results", [])
        transactions.extend(results)
    return transactions


# ------------------------------------------------------------ Payments API


def _payments_token() -> str:
    return _token_request({"grant_type": "client_credentials", "scope": PAYMENTS_SCOPES})["access_token"]


def _signed_post(path: str, body: dict) -> dict:
    idempotency_key = str(uuid.uuid4())
    raw = json.dumps(body, separators=(",", ":"))
    with open(_env("TRUELAYER_SIGNING_KEY_PATH"), "rb") as f:
        pem = f.read()
    headers = {
        "Authorization": f"Bearer {_payments_token()}",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotency_key,
        "Tl-Signature": tl_signature("POST", path, idempotency_key, raw, _env("TRUELAYER_SIGNING_KEY_ID"), pem),
    }
    return _check(httpx.post(f"{API_URL}{path}", content=raw, headers=headers, timeout=30))


def _get(path: str) -> dict:
    headers = {"Authorization": f"Bearer {_payments_token()}"}
    return _check(httpx.get(f"{API_URL}{path}", headers=headers, timeout=20))


def create_mandate(user: dict, max_monthly_gbp: float) -> dict:
    """Sweeping VRP mandate into the user's on-ramp account, capped at their
    own monthly surplus. (No `reference`: TrueLayer only allows it for
    regulated clients.)"""
    cap_minor = int(round(max_monthly_gbp * 100))
    body = {
        "mandate": {
            "type": "sweeping",
            "provider_selection": {"type": "preselected", "provider_id": VRP_PROVIDER},
            "beneficiary": {
                "type": "external_account",
                "account_holder_name": "Breathing Room pot top-up",
                "account_identifier": {
                    "type": "sort_code_account_number",
                    "sort_code": os.environ.get("ONRAMP_SORT_CODE", "040668"),
                    "account_number": os.environ.get("ONRAMP_ACCOUNT_NUMBER", "00000871"),
                },
            },
        },
        "currency": "GBP",
        "user": user,
        "constraints": {
            "maximum_individual_amount": cap_minor,
            "periodic_limits": {"month": {"maximum_amount": cap_minor, "period_alignment": "calendar"}},
        },
    }
    return _signed_post("/v3/mandates", body)


def mandate_hpp_url(mandate_id: str, resource_token: str, return_uri: str) -> str:
    fragment = urllib.parse.urlencode(
        {"mandate_id": mandate_id, "resource_token": resource_token, "return_uri": return_uri, "max_wait_for_result": 30}
    )
    return f"{HPP_URL}/mandates#{fragment}"


def get_mandate(mandate_id: str) -> dict:
    return _get(f"/v3/mandates/{mandate_id}")


def create_mandate_payment(mandate_id: str, amount_gbp: float, user_id: str, reference: str) -> dict:
    body = {
        "amount_in_minor": int(round(amount_gbp * 100)),
        "currency": "GBP",
        "payment_method": {
            "type": "mandate",
            "mandate_id": mandate_id,
            "reference": reference[:18],
        },
        "user": {"id": user_id},
    }
    return _signed_post("/v3/payments", body)


def get_payment(payment_id: str) -> dict:
    return _get(f"/v3/payments/{payment_id}")
