"""Payday collection providers, behind one interface.

TrueLayer's Data API (truelayer.py) spots payday for everyone; *collecting*
the surplus can go through any of these, whichever is approved and
configured. Each provider:

  start(wallet, user, max_monthly_gbp) -> (mandate_ref, url the user approves at)
  mandate_status(mandate_ref)          -> "authorized" | "pending" | "failed"
  collect(mandate_ref, amount_gbp, ref) -> payment_id
  payment_status(payment_id)            -> "executed" | "pending" | "failed"

- gocardless: UK Direct Debit (Billing Request Flow). Sandbox is self-serve.
- stripe:     Bacs Direct Debit via Checkout (setup mode), test mode.
- truelayer:  commercial VRP mandate (Payments API v3; sales-gated).
"""
from __future__ import annotations

import os
import uuid

import httpx

from . import truelayer

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")


class CollectorError(RuntimeError):
    pass


def _check(resp: httpx.Response) -> dict:
    if resp.status_code >= 400:
        raise CollectorError(f"{resp.request.method} {resp.request.url.path} -> {resp.status_code}: {resp.text[:400]}")
    return resp.json() if resp.content else {}


def _split_name(name: str) -> tuple[str, str]:
    first, _, last = name.strip().partition(" ")
    return first or name, last or first or name


class GoCardless:
    name = "gocardless"
    label = "Direct Debit (GoCardless)"
    API = "https://api-sandbox.gocardless.com"

    def configured(self) -> bool:
        return bool(os.environ.get("GOCARDLESS_ACCESS_TOKEN"))

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {os.environ['GOCARDLESS_ACCESS_TOKEN']}",
            "GoCardless-Version": "2015-07-06",
            "Content-Type": "application/json",
            "Idempotency-Key": str(uuid.uuid4()),
        }

    def _post(self, path: str, body: dict) -> dict:
        return _check(httpx.post(f"{self.API}{path}", json=body, headers=self._headers(), timeout=20))

    def _get(self, path: str) -> dict:
        return _check(httpx.get(f"{self.API}{path}", headers=self._headers(), timeout=20))

    def start(self, wallet: str, user: dict, max_monthly_gbp: float) -> tuple[str, str]:
        request = self._post(
            "/billing_requests",
            {"billing_requests": {"mandate_request": {"scheme": "bacs", "currency": "GBP"}, "metadata": {"wallet": wallet}}},
        )["billing_requests"]
        given, family = _split_name(user["name"])
        flow = self._post(
            "/billing_request_flows",
            {
                "billing_request_flows": {
                    "redirect_uri": f"{FRONTEND_URL}/sweep",
                    "exit_uri": f"{FRONTEND_URL}/sweep",
                    "links": {"billing_request": request["id"]},
                    "prefilled_customer": {"given_name": given, "family_name": family, "email": user["email"]},
                }
            },
        )["billing_request_flows"]
        return request["id"], flow["authorisation_url"]

    def mandate_status(self, mandate_ref: str) -> str:
        request = self._get(f"/billing_requests/{mandate_ref}")["billing_requests"]
        if request["status"] == "fulfilled":
            return "authorized"
        return "failed" if request["status"] == "cancelled" else "pending"

    def _mandate_id(self, mandate_ref: str) -> str:
        request = self._get(f"/billing_requests/{mandate_ref}")["billing_requests"]
        mandate = request.get("links", {}).get("mandate_request_mandate")
        if not mandate:
            raise CollectorError("Direct Debit mandate not set up yet")
        return mandate

    def collect(self, mandate_ref: str, amount_gbp: float, reference: str) -> str:
        payment = self._post(
            "/payments",
            {
                "payments": {
                    "amount": int(round(amount_gbp * 100)),
                    "currency": "GBP",
                    "description": reference,
                    "links": {"mandate": self._mandate_id(mandate_ref)},
                }
            },
        )["payments"]
        if os.environ.get("GOCARDLESS_SIMULATE_PAID") == "1":
            # Sandbox only: real Bacs takes ~3 working days. Fast-forward it
            # so the demo shows the whole flow in minutes.
            self._post(
                "/scenario_simulators/payment_paid_out/actions/run",
                {"data": {"links": {"resource": payment["id"]}}},
            )
        return payment["id"]

    def payment_status(self, payment_id: str) -> str:
        status = self._get(f"/payments/{payment_id}")["payments"]["status"]
        if status in ("confirmed", "paid_out"):
            return "executed"
        if status in ("failed", "cancelled", "customer_approval_denied", "charged_back"):
            return "failed"
        return "pending"


class StripeBacs:
    name = "stripe"
    label = "Direct Debit (Stripe)"
    API = "https://api.stripe.com/v1"

    def configured(self) -> bool:
        return os.environ.get("STRIPE_SECRET_KEY", "").startswith("sk_test_")

    def _auth(self) -> tuple[str, str]:
        return (os.environ["STRIPE_SECRET_KEY"], "")

    def _post(self, path: str, data: dict) -> dict:
        return _check(httpx.post(f"{self.API}{path}", data=data, auth=self._auth(), timeout=20))

    def _get(self, path: str, params: dict | None = None) -> dict:
        return _check(httpx.get(f"{self.API}{path}", params=params, auth=self._auth(), timeout=20))

    def start(self, wallet: str, user: dict, max_monthly_gbp: float) -> tuple[str, str]:
        customer = self._post("/customers", {"name": user["name"], "email": user["email"], "metadata[wallet]": wallet})
        session = self._post(
            "/checkout/sessions",
            {
                "mode": "setup",
                "currency": "gbp",
                "customer": customer["id"],
                "payment_method_types[]": "bacs_debit",
                "success_url": f"{FRONTEND_URL}/sweep",
                "cancel_url": f"{FRONTEND_URL}/sweep",
            },
        )
        return session["id"], session["url"]

    def _setup_intent(self, mandate_ref: str) -> dict:
        session = self._get(f"/checkout/sessions/{mandate_ref}", {"expand[]": "setup_intent"})
        return session.get("setup_intent") or {}

    def mandate_status(self, mandate_ref: str) -> str:
        status = self._setup_intent(mandate_ref).get("status")
        if status == "succeeded":
            return "authorized"
        return "failed" if status == "canceled" else "pending"

    def collect(self, mandate_ref: str, amount_gbp: float, reference: str) -> str:
        intent = self._setup_intent(mandate_ref)
        payment = self._post(
            "/payment_intents",
            {
                "amount": int(round(amount_gbp * 100)),
                "currency": "gbp",
                "customer": intent["customer"],
                "payment_method": intent["payment_method"],
                "payment_method_types[]": "bacs_debit",
                "off_session": "true",
                "confirm": "true",
                "description": reference,
            },
        )
        return payment["id"]

    def payment_status(self, payment_id: str) -> str:
        status = self._get(f"/payment_intents/{payment_id}")["status"]
        if status == "succeeded":
            return "executed"
        return "failed" if status in ("canceled", "requires_payment_method") else "pending"


class TrueLayerVrp:
    name = "truelayer"
    label = "Open Banking VRP (TrueLayer)"

    def configured(self) -> bool:
        return truelayer.payments_configured()

    def start(self, wallet: str, user: dict, max_monthly_gbp: float) -> tuple[str, str]:
        user = {"id": str(uuid.uuid4()), **user}
        created = truelayer.create_mandate(user, max_monthly_gbp)
        url = truelayer.mandate_hpp_url(created["id"], created["resource_token"], f"{FRONTEND_URL}/sweep")
        # The payment on a mandate needs the same TrueLayer user id.
        return f"{created['id']}|{user['id']}", url

    def mandate_status(self, mandate_ref: str) -> str:
        status = truelayer.get_mandate(mandate_ref.split("|")[0]).get("status")
        if status == "authorized":
            return "authorized"
        return "failed" if status in ("failed", "revoked") else "pending"

    def collect(self, mandate_ref: str, amount_gbp: float, reference: str) -> str:
        mandate_id, user_id = mandate_ref.split("|")
        return truelayer.create_mandate_payment(mandate_id, amount_gbp, user_id, reference)["id"]

    def payment_status(self, payment_id: str) -> str:
        status = truelayer.get_payment(payment_id).get("status", "")
        if status in ("executed", "settled"):
            return "executed"
        return "failed" if status == "failed" else "pending"


ALL = {c.name: c for c in (GoCardless(), StripeBacs(), TrueLayerVrp())}


def available() -> list[dict]:
    return [{"name": c.name, "label": c.label} for c in ALL.values() if c.configured()]


def default_name() -> str | None:
    preferred = os.environ.get("COLLECTION_PROVIDER")
    if preferred in ALL and ALL[preferred].configured():
        return preferred
    names = [c["name"] for c in available()]
    return names[0] if names else None
