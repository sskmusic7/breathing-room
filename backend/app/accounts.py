"""Per-user saved data: the budget (SFS), creditors' payment details and
drafted letters, so nothing is lost when the phone closes the tab.

Keyed by the Privy user id from a verified Privy access token (ES256, keys
from Privy's JWKS), never by a wallet address someone could guess. Stored as
JSON on the container's state volume, like the bank store.
"""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

import jwt
from fastapi import APIRouter, Header, HTTPException

PRIVY_APP_ID = os.environ.get("PRIVY_APP_ID", "cmuvjolyq000f0ejt7h9oh2wl")
_jwks = jwt.PyJWKClient(f"https://auth.privy.io/api/v1/apps/{PRIVY_APP_ID}/jwks.json", cache_keys=True)

STATE_PATH = Path(os.environ.get("ACCOUNTS_STATE_PATH", Path(__file__).resolve().parents[1] / "data" / "state" / "accounts.json"))
_lock = threading.Lock()
MAX_LETTERS = 50

router = APIRouter(prefix="/me", tags=["account"])


def _user_id(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Log in to save your progress.")
    token = authorization.removeprefix("Bearer ")
    try:
        key = _jwks.get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=["ES256"], audience=PRIVY_APP_ID, issuer="privy.io")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Your login has expired. Please log in again.")
    return claims["sub"]


def _load() -> dict:
    return json.loads(STATE_PATH.read_text()) if STATE_PATH.exists() else {}


def _save(data: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(STATE_PATH)


def _update(uid: str, fn) -> dict:
    with _lock:
        data = _load()
        record = data.setdefault(uid, {"sfs": None, "creditors": {}, "letters": []})
        fn(record)
        record["updated_at"] = datetime.now(timezone.utc).isoformat()
        _save(data)
        return record


@router.get("")
def get_me(authorization: str | None = Header(None)) -> dict:
    uid = _user_id(authorization)
    with _lock:
        return _load().get(uid, {"sfs": None, "creditors": {}, "letters": []})


@router.put("/sfs")
def save_sfs(body: dict, authorization: str | None = Header(None)) -> dict:
    uid = _user_id(authorization)
    _update(uid, lambda r: r.__setitem__("sfs", {"inputs": body.get("inputs"), "result": body.get("result")}))
    return {"ok": True}


@router.put("/creditors")
def save_creditors(body: dict, authorization: str | None = Header(None)) -> dict:
    """{creditor_id: {sort_code, account_no, reference, address, city, postcode}}"""
    uid = _user_id(authorization)
    _update(uid, lambda r: r.__setitem__("creditors", body.get("creditors") or {}))
    return {"ok": True}


@router.post("/letters")
def save_letter(body: dict, authorization: str | None = Header(None)) -> dict:
    uid = _user_id(authorization)
    letter = {
        "id": datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "issuer_name": body.get("issuer_name"),
        "issuer_type": body.get("issuer_type"),
        "reference_number": body.get("reference_number"),
        "amount_gbp": body.get("amount_gbp"),
        "letter": body.get("letter", ""),
    }

    def add(r: dict) -> None:
        r["letters"] = [letter, *r.get("letters", [])][:MAX_LETTERS]

    _update(uid, add)
    return letter
