"""Breathing Room backend - FastAPI app.

Endpoints:
  GET  /health
  POST /calculate-sfs   - deterministic SFS budget/pro-rata calculation
  POST /draft-appeal    - RAG-grounded representation letter draft
  GET  /rag/search      - raw legal corpus search (debugging/demo)

No Open Banking or OCR integration is wired up yet in this MVP - see
README.md "What's stubbed" for the honest list of what still needs real
integration work (TrueLayer/Yapily sandbox, a vision OCR call, Privy
transaction building) versus what's fully implemented and tested today
(the SFS engine and the RAG retrieval + drafting pipeline).
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.rag.draft import MitigatingCircumstances, NoticeFacts, draft_representation_letter
from app.rag.query import query_legal_corpus
from app.sfs_engine.calculator import calculate_sfs
from app.sfs_engine.models import SfsRequest, SfsResult

app = FastAPI(title="Breathing Room API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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


@app.get("/rag/search")
def rag_search(q: str, issuer_type: str | None = None, n: int = 4) -> list[dict]:
    results = query_legal_corpus(q, issuer_type=issuer_type, n_results=n)
    return [
        {"id": r.id, "metadata": r.metadata, "distance": r.distance, "excerpt": r.text[:300]}
        for r in results
    ]
