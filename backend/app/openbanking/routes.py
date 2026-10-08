"""/bank/* endpoints: link a bank, authorise the VRP mandate, set the plan,
see status. Users are identified by their (Privy embedded) wallet address."""
from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from . import onramp, payday, store, truelayer

router = APIRouter(prefix="/bank", tags=["bank"])

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")


def _require_config() -> None:
    if not (truelayer.is_configured() and onramp.is_configured()):
        raise HTTPException(status_code=503, detail="Open Banking is not configured on this server yet")


def _wallet(wallet: str) -> str:
    if not (wallet.startswith("0x") and len(wallet) == 42):
        raise HTTPException(status_code=400, detail="invalid wallet")
    return wallet.lower()


@router.get("/connect")
def connect(wallet: str) -> RedirectResponse:
    _require_config()
    return RedirectResponse(truelayer.data_auth_link(state=_wallet(wallet)))


@router.get("/callback")
def callback(code: str | None = None, state: str | None = None, error: str | None = None) -> RedirectResponse:
    if error or not code or not state:
        return RedirectResponse(f"{FRONTEND_URL}/sweep?bank=error")
    wallet = _wallet(state)
    store.update(wallet, tokens=truelayer.exchange_code(code))
    store.add_event(wallet, "Bank connected (read-only).")
    return RedirectResponse(f"{FRONTEND_URL}/sweep?bank=connected")


class MandateRequest(BaseModel):
    wallet: str
    name: str = Field(min_length=1)
    email: str = Field(min_length=3)
    max_monthly_gbp: float = Field(gt=0)


@router.post("/mandate")
def mandate(req: MandateRequest) -> dict:
    _require_config()
    wallet = _wallet(req.wallet)
    record = store.get(wallet)
    tl_user_id = record.get("tl_user_id") or str(uuid.uuid4())
    created = truelayer.create_mandate({"id": tl_user_id, "name": req.name, "email": req.email}, req.max_monthly_gbp)
    store.update(wallet, tl_user_id=tl_user_id, mandate_id=created["id"], mandate_status=created.get("status"))
    return {"url": truelayer.mandate_hpp_url(created["id"], created["resource_token"], f"{FRONTEND_URL}/sweep")}


class PlanRequest(BaseModel):
    wallet: str
    pot_address: str
    surplus_gbp: float = Field(gt=0)


@router.post("/plan")
def plan(req: PlanRequest) -> dict:
    wallet = _wallet(req.wallet)
    store.update(wallet, plan={"pot_address": req.pot_address, "surplus_gbp": req.surplus_gbp})
    return {"ok": True}


@router.get("/status")
def status(wallet: str) -> dict:
    wallet = _wallet(wallet)
    record = store.get(wallet)
    if record.get("mandate_id") and record.get("mandate_status") != "authorized" and truelayer.is_configured():
        try:
            mandate_status = truelayer.get_mandate(record["mandate_id"]).get("status")
            if mandate_status != record.get("mandate_status"):
                record = store.update(wallet, mandate_status=mandate_status)
                if mandate_status == "authorized":
                    store.add_event(wallet, "Automatic payday collection approved in your bank.")
                    record = store.get(wallet)
        except truelayer.TrueLayerError:
            pass
    return {
        "configured": truelayer.is_configured() and onramp.is_configured(),
        "bank_connected": bool(record.get("tokens")),
        "mandate_status": record.get("mandate_status"),
        "plan": record.get("plan"),
        "collecting": bool(record.get("pending_payment")),
        "events": record.get("events", []),
    }


@router.get("/summary")
def summary(wallet: str) -> dict:
    """Last ~30 days of real transactions summarised for the SFS form."""
    _require_config()
    wallet = _wallet(wallet)
    record = store.get(wallet)
    if not record.get("tokens"):
        raise HTTPException(status_code=404, detail="bank not connected")
    tokens = truelayer.refresh_data_tokens(record["tokens"])
    if tokens is not record["tokens"]:
        store.update(wallet, tokens=tokens)
    return payday.summarise_budget(truelayer.get_transactions(tokens["access_token"], days=30))


@router.post("/check-now")
def check_now(wallet: str) -> dict:
    """Runs the payday check immediately (the background loop runs it every 2 min)."""
    _require_config()
    wallet = _wallet(wallet)
    try:
        payday.run_cycle(wallet)
    except truelayer.TrueLayerError as exc:
        store.add_event(wallet, f"Payday check hit a problem: {exc}"[:300])
    return status(wallet)
