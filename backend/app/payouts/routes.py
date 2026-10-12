"""/payouts/*: connect Revolut (one-time consent callback) and status."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from . import revolut

router = APIRouter(prefix="/payouts", tags=["payouts"])


@router.get("/revolut/callback", response_class=HTMLResponse)
def revolut_callback(code: str | None = None, error: str | None = None) -> str:
    if error or not code:
        return f"<h2>Revolut connection failed</h2><p>{error or 'No code returned.'}</p>"
    try:
        revolut.exchange_code(code)
        account = revolut.gbp_account_id()
    except revolut.RevolutError as exc:
        return f"<h2>Revolut connection failed</h2><p>{exc}</p>"
    return f"<h2>Revolut connected</h2><p>Creditor payouts will be sent from GBP account {account[:8]}… You can close this tab.</p>"


@router.get("/status")
def status() -> dict:
    return {"configured": revolut.configured(), "connected": revolut.connected()}
