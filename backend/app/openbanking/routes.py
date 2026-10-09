"""/bank/* endpoints: link a bank, authorise the VRP mandate, set the plan,
see status. Users are identified by their (Privy embedded) wallet address."""
from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from . import collectors, onramp, payday, store, truelayer

router = APIRouter(prefix="/bank", tags=["bank"])

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")


def _require_config() -> None:
    if not (truelayer.data_configured() and onramp.is_configured()):
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
    provider: str | None = None


@router.post("/mandate")
def mandate(req: MandateRequest) -> dict:
    _require_config()
    wallet = _wallet(req.wallet)
    name = req.provider or collectors.default_name()
    if name not in collectors.ALL or not collectors.ALL[name].configured():
        raise HTTPException(status_code=503, detail="No payment collection provider is configured yet")
    try:
        mandate_ref, url = collectors.ALL[name].start(
            wallet, {"name": req.name, "email": req.email}, req.max_monthly_gbp
        )
    except (collectors.CollectorError, truelayer.TrueLayerError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    store.update(wallet, collector=name, mandate_ref=mandate_ref, mandate_status="pending")
    return {"url": url}


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
    if record.get("mandate_ref") and record.get("mandate_status") != "authorized":
        try:
            mandate_status = collectors.ALL[record["collector"]].mandate_status(record["mandate_ref"])
            if mandate_status != record.get("mandate_status"):
                record = store.update(wallet, mandate_status=mandate_status)
                if mandate_status == "authorized":
                    store.add_event(wallet, "Automatic payday collection approved in your bank.")
                    record = store.get(wallet)
        except (collectors.CollectorError, truelayer.TrueLayerError):
            pass
    return {
        "configured": truelayer.data_configured() and onramp.is_configured(),
        "providers": collectors.available(),
        "collector": record.get("collector"),
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
    except (collectors.CollectorError, truelayer.TrueLayerError) as exc:
        store.add_event(wallet, f"Payday check hit a problem: {exc}"[:300])
    return status(wallet)
