from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

BASE_FACTS = {
    "issuer_type": "local_council",
    "issuer_name": "Camden Council",
    "contravention_code": "01",
    "stage_of_notice": "penalty_charge_notice",
    "date_of_contravention": "2026-09-01",
    "date_of_notice": "2026-09-03",
    "amount_gbp": "130.00",
    "reference_number": "CD12345678",
}


def test_health_details_without_consent_rejected():
    body = {**BASE_FACTS, "mitigating": {"neurodivergence_or_disability": "ADHD"}}
    resp = client.post("/draft-appeal", json=body)
    assert resp.status_code == 400


def test_health_details_with_consent_accepted():
    body = {
        **BASE_FACTS,
        "health_data_consent": True,
        "mitigating": {"neurodivergence_or_disability": "ADHD"},
    }
    resp = client.post("/draft-appeal", json=body)
    assert resp.status_code == 200
    assert "Equality Act" in resp.json()["letter"]


def test_non_health_mitigation_needs_no_consent():
    body = {**BASE_FACTS, "mitigating": {"signage_obscured": True}}
    resp = client.post("/draft-appeal", json=body)
    assert resp.status_code == 200
    assert resp.json()["letter"]
