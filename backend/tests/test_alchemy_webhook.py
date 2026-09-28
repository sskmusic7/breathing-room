import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from app.main import app
from app.webhooks.alchemy import parse_address_activity, verify_signature

SIGNING_KEY = "test-signing-key"

SAMPLE_PAYLOAD = {
    "webhookId": "wh_123",
    "id": "evt_456",
    "createdAt": "2026-09-28T00:00:00.000Z",
    "type": "ADDRESS_ACTIVITY",
    "event": {
        "network": "MONAD_TESTNET",
        "activity": [
            {
                "fromAddress": "0x1111111111111111111111111111111111111111",
                "toAddress": "0x8960b2bbb4d1c1d9c20b23835680465ad98f95af",
                "value": 0.5,
                "asset": "MON",
                "category": "external",
                "hash": "0xabc123",
            },
            {
                # Outgoing transfer - should be ignored by parse_address_activity's
                # "only incoming deposits" filtering... actually category alone
                # doesn't distinguish direction in Alchemy's schema, so this one
                # exercises the "no value" skip path instead.
                "fromAddress": "0x8960b2bbb4d1c1d9c20b23835680465ad98f95af",
                "toAddress": "0x2222222222222222222222222222222222222222",
                "asset": "MON",
                "category": "external",
                "hash": "0xdef456",
            },
        ],
    },
}


def _sign(body: bytes, key: str = SIGNING_KEY) -> str:
    return hmac.new(key.encode("utf-8"), body, hashlib.sha256).hexdigest()


def test_verify_signature_accepts_correct_hmac():
    body = b'{"hello":"world"}'
    sig = _sign(body)
    assert verify_signature(body, sig, SIGNING_KEY) is True


def test_verify_signature_rejects_wrong_signature():
    body = b'{"hello":"world"}'
    assert verify_signature(body, "0" * 64, SIGNING_KEY) is False


def test_verify_signature_rejects_tampered_body():
    body = b'{"hello":"world"}'
    sig = _sign(body)
    tampered = b'{"hello":"WORLD"}'
    assert verify_signature(tampered, sig, SIGNING_KEY) is False


def test_parse_address_activity_extracts_incoming_deposit():
    events = parse_address_activity(SAMPLE_PAYLOAD)
    assert len(events) == 1
    event = events[0]
    assert event.tx_hash == "0xabc123"
    assert event.network == "MONAD_TESTNET"
    assert event.value_wei == int(0.5 * 10**18)


def test_webhook_endpoint_rejects_missing_signature(monkeypatch):
    monkeypatch.setenv("ALCHEMY_WEBHOOK_SIGNING_KEY", SIGNING_KEY)
    client = TestClient(app)
    resp = client.post("/webhooks/alchemy", json=SAMPLE_PAYLOAD)
    assert resp.status_code == 401


def test_webhook_endpoint_rejects_bad_signature(monkeypatch):
    monkeypatch.setenv("ALCHEMY_WEBHOOK_SIGNING_KEY", SIGNING_KEY)
    client = TestClient(app)
    resp = client.post(
        "/webhooks/alchemy",
        json=SAMPLE_PAYLOAD,
        headers={"x-alchemy-signature": "0" * 64},
    )
    assert resp.status_code == 401


def test_webhook_endpoint_accepts_valid_signature(monkeypatch):
    monkeypatch.setenv("ALCHEMY_WEBHOOK_SIGNING_KEY", SIGNING_KEY)
    client = TestClient(app)

    body = json.dumps(SAMPLE_PAYLOAD).encode("utf-8")
    sig = _sign(body)

    resp = client.post(
        "/webhooks/alchemy",
        content=body,
        headers={"x-alchemy-signature": sig, "content-type": "application/json"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"received": 1}


def test_webhook_endpoint_503_when_unconfigured(monkeypatch):
    monkeypatch.delenv("ALCHEMY_WEBHOOK_SIGNING_KEY", raising=False)
    client = TestClient(app)
    resp = client.post("/webhooks/alchemy", json=SAMPLE_PAYLOAD)
    assert resp.status_code == 503
