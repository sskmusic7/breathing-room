import base64
import json

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat
from fastapi.testclient import TestClient

from app.main import app
from app.openbanking import payday, store, truelayer

WALLET = "0x" + "ab" * 20
POT = "0x" + "cd" * 20


def _b64decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def test_tl_signature_is_a_valid_detached_es512_jws():
    key = ec.generate_private_key(ec.SECP521R1())
    pem = key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    body = '{"currency":"GBP","amount_in_minor":100}'
    sig = truelayer.tl_signature("post", "/v3/payments/", "idem-1", body, "kid-1", pem)

    header_b64, payload_b64, sig_b64 = sig.split(".")
    assert payload_b64 == ""  # detached
    header = json.loads(_b64decode(header_b64))
    assert header == {"alg": "ES512", "kid": "kid-1", "tl_version": "2", "tl_headers": "Idempotency-Key"}

    raw = _b64decode(sig_b64)
    assert len(raw) == 132  # raw r||s, 66 bytes each
    payload = f"POST /v3/payments\nIdempotency-Key: idem-1\n{body}".encode()
    signing_input = f"{header_b64}.{base64.urlsafe_b64encode(payload).rstrip(b'=').decode()}".encode()
    der = encode_dss_signature(int.from_bytes(raw[:66], "big"), int.from_bytes(raw[66:], "big"))
    key.public_key().verify(der, signing_input, ec.ECDSA(hashes.SHA512()))  # raises if invalid


def test_find_payday_prefers_salary_and_skips_processed():
    txs = [
        {"transaction_id": "a", "amount": 900, "description": "TRANSFER FROM SAVINGS", "timestamp": "2026-10-01"},
        {"transaction_id": "b", "amount": 1800, "description": "ACME LTD SALARY", "timestamp": "2026-09-28"},
        {"transaction_id": "c", "amount": -40, "description": "TESCO", "timestamp": "2026-10-02"},
    ]
    assert payday.find_payday(txs, set())["transaction_id"] == "b"
    assert payday.find_payday(txs, {"b"})["transaction_id"] == "a"  # falls back to largest credit
    assert payday.find_payday(txs, {"a", "b"}) is None


def test_summarise_budget_splits_fixed_and_flexible():
    txs = [
        {"amount": 1800, "transaction_category": "CREDIT"},
        {"amount": -700, "transaction_category": "STANDING_ORDER"},
        {"amount": -100, "transaction_category": "DIRECT_DEBIT"},
        {"amount": -250.5, "transaction_category": "PURCHASE"},
    ]
    assert payday.summarise_budget(txs) == {"employment": 1800.0, "fixed_costs": 800.0, "flexible_costs": 250.5}


@pytest.fixture
def bank_state(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "STATE_PATH", tmp_path / "bank.json")
    store.update(
        WALLET,
        tokens={"access_token": "t", "refresh_token": "r", "expires_at": 9e12},
        mandate_id="m-1",
        mandate_status="authorized",
        tl_user_id="u-1",
        plan={"pot_address": POT, "surplus_gbp": 495.0},
    )


def test_cycle_collects_surplus_on_payday_then_onramps_once_executed(bank_state, monkeypatch):
    monkeypatch.setattr(truelayer, "get_transactions", lambda token, days=35: [
        {"transaction_id": "pay-1", "amount": 1800, "description": "SALARY", "timestamp": "2026-10-01"},
    ])
    created = []
    monkeypatch.setattr(truelayer, "create_mandate_payment",
                        lambda mandate_id, amount, user_id, ref: created.append((mandate_id, amount)) or {"id": "p-1"})
    payday.run_cycle(WALLET)
    assert created == [("m-1", 495.0)]  # only the surplus, never the whole salary
    assert store.get(WALLET)["pending_payment"]["id"] == "p-1"

    monkeypatch.setattr(truelayer, "get_payment", lambda pid: {"status": "authorized"})
    payday.run_cycle(WALLET)  # still pending at TrueLayer -> nothing new
    assert len(created) == 1

    sent = []
    monkeypatch.setattr(truelayer, "get_payment", lambda pid: {"status": "executed"})
    monkeypatch.setattr(payday.onramp, "send_to_pot", lambda pot, gbp: sent.append((pot, gbp)) or "0xtx")
    payday.run_cycle(WALLET)
    assert sent == [(POT, 495.0)]
    record = store.get(WALLET)
    assert record["pending_payment"] is None and record["last_onramp_tx"] == "0xtx"

    payday.run_cycle(WALLET)  # same payday is never collected twice
    assert len(created) == 1


def test_bank_endpoints_503_until_configured(monkeypatch):
    for name in ("TRUELAYER_CLIENT_ID", "ONRAMP_PRIVATE_KEY"):
        monkeypatch.delenv(name, raising=False)
    client = TestClient(app)
    assert client.get(f"/bank/connect?wallet={WALLET}", follow_redirects=False).status_code == 503
    assert client.get("/bank/connect?wallet=nope", follow_redirects=False).status_code in (400, 503)
