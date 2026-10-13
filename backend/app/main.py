"""Breathing Room backend - FastAPI app.

Endpoints:
  GET  /health
  POST /calculate-sfs   - deterministic SFS budget/pro-rata calculation
  POST /draft-appeal    - RAG-grounded representation letter draft
  POST /scan-letter     - read a photo of a notice with KIMI vision
  GET  /rag/search      - raw legal corpus search (debugging/demo)

  /bank/*               - TrueLayer Open Banking: link bank, VRP mandate,
                          automatic payday surplus collection (app/openbanking/)

Payday checks run in a background loop every PAYDAY_CHECK_SECONDS (120).
"""
from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app import jobs, proof
from app.accounts import router as accounts_router
from app.openbanking import payday as bank_payday
from app.openbanking.routes import router as bank_router
from app.payouts import worker as payout_worker
from app.payouts.routes import router as payouts_router
from app.rag.draft import MitigatingCircumstances, NoticeFacts, draft_representation_letter
from app.rag.query import query_legal_corpus
from app.scan import ScanError, scan_letter
from app.sfs_engine.calculator import calculate_sfs
from app.sfs_engine.models import SfsRequest, SfsResult
from app.webhooks.alchemy import notify_payday_deposit, parse_address_activity, verify_signature

PAYDAY_CHECK_SECONDS = int(os.environ.get("PAYDAY_CHECK_SECONDS", "120"))


async def _payday_loop() -> None:
    while True:
        await asyncio.sleep(PAYDAY_CHECK_SECONDS)
        await asyncio.to_thread(bank_payday.run_all)
        await asyncio.to_thread(payout_worker.run_all)


async def _proof_loop() -> None:
    """Keeps the public Proof page (app/proof.py) close to live."""
    while True:
        await asyncio.sleep(8)
        for step in (proof.scan, proof.pay_out):
            try:
                await asyncio.to_thread(step)
            except Exception:
                pass  # transient RPC/provider errors; the next pass retries


@asynccontextmanager
async def lifespan(_: FastAPI):
    tasks = [asyncio.create_task(_proof_loop())]
    if PAYDAY_CHECK_SECONDS > 0:
        tasks.append(asyncio.create_task(_payday_loop()))
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(title="Breathing Room API", version="0.1.0", lifespan=lifespan)
app.include_router(bank_router)
app.include_router(payouts_router)
app.include_router(accounts_router)
app.include_router(jobs.router)
app.include_router(proof.router)

app.add_middleware(
    CORSMiddleware,
    # Comma-separated, e.g. "http://localhost:3000,https://breathing-room.vercel.app"
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/calculate-sfs", response_model=SfsResult)
def calculate_sfs_endpoint(request: SfsRequest) -> SfsResult:
    return calculate_sfs(request)


@app.post("/draft-appeal")
def draft_appeal_endpoint(facts: dict) -> dict:
    mitigating = MitigatingCircumstances(**facts.pop("mitigating", {}))
    notice_facts = NoticeFacts(mitigating=mitigating, **facts)
    return draft_representation_letter(notice_facts)


@app.post("/jobs/draft-appeal")
def draft_appeal_job(facts: dict) -> dict:
    """Same as /draft-appeal, as a background job the app polls (see app/jobs.py)."""
    mitigating = MitigatingCircumstances(**facts.pop("mitigating", {}))
    notice_facts = NoticeFacts(mitigating=mitigating, **facts)
    job_id = jobs.start(
        lambda: draft_representation_letter(notice_facts),
        lambda exc: "We couldn't write your letter just now. Please try again.",
    )
    return {"job_id": job_id}


@app.post("/jobs/scan-letter")
def scan_letter_job(body: dict) -> dict:
    image = body.get("image", "")
    job_id = jobs.start(
        lambda: scan_letter(image),
        lambda exc: str(exc) if isinstance(exc, ScanError) else "We couldn't read that letter just now. Please type the details in.",
    )
    return {"job_id": job_id}


@app.post("/scan-letter")
def scan_letter_endpoint(body: dict) -> dict:
    try:
        return scan_letter(body.get("image", ""))
    except ScanError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=502, detail="We couldn't read that letter just now. Please type the details in.")


@app.get("/rag/search")
def rag_search(q: str, issuer_type: str | None = None, n: int = 4) -> list[dict]:
    results = query_legal_corpus(q, issuer_type=issuer_type, n_results=n)
    return [
        {"id": r.id, "metadata": r.metadata, "distance": r.distance, "excerpt": r.text[:300]}
        for r in results
    ]


@app.post("/webhooks/alchemy")
async def alchemy_webhook(request: Request) -> dict:
    """Alchemy Notify Address Activity webhook. See app/webhooks/alchemy.py
    for why this only ever triggers a notification, never money movement -
    that's Chainlink Automation's job (contracts/src/DebtPotsAutomation.sol),
    kept independent on purpose.
    """
    signing_key = os.environ.get("ALCHEMY_WEBHOOK_SIGNING_KEY")
    if not signing_key:
        raise HTTPException(status_code=503, detail="ALCHEMY_WEBHOOK_SIGNING_KEY not configured")

    raw_body = await request.body()
    signature = request.headers.get("x-alchemy-signature", "")

    if not verify_signature(raw_body, signature, signing_key):
        raise HTTPException(status_code=401, detail="invalid signature")

    payload = await request.json()
    events = parse_address_activity(payload)
    for event in events:
        notify_payday_deposit(event)

    return {"received": len(events)}
