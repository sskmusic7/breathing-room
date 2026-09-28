"""Query layer over the local legal corpus vector store.

This module only ever returns retrieved statutory context + citations. The
actual letter-drafting (turning retrieved context + user facts into a formal
representation) is a separate, explicit LLM call in app/rag/draft.py so the
two responsibilities - grounding vs. generation - stay clearly separated and
auditable.
"""
from __future__ import annotations

from dataclasses import dataclass

from .ingest import COLLECTION_NAME, get_client


@dataclass
class RetrievedDoc:
    id: str
    text: str
    metadata: dict
    distance: float


def query_legal_corpus(
    query: str,
    *,
    issuer_type: str | None = None,
    stage_of_notice: str | None = None,
    category: str | None = None,
    n_results: int = 4,
) -> list[RetrievedDoc]:
    """Semantic search over the legal corpus, optionally pre-filtered by
    metadata (e.g. only `issuer_type=local_council` documents) before ranking
    by similarity to the query text.
    """
    client = get_client()
    collection = client.get_or_create_collection(COLLECTION_NAME)

    where = {}
    if issuer_type:
        where["issuer_type"] = issuer_type
    if stage_of_notice:
        where["stage_of_notice"] = stage_of_notice
    if category:
        where["category"] = category

    result = collection.query(
        query_texts=[query],
        n_results=n_results,
        where=where or None,
    )

    docs: list[RetrievedDoc] = []
    ids = result.get("ids", [[]])[0]
    documents = result.get("documents", [[]])[0]
    metadatas = result.get("metadatas", [[]])[0]
    distances = result.get("distances", [[]])[0]

    for doc_id, text, metadata, distance in zip(ids, documents, metadatas, distances):
        docs.append(RetrievedDoc(id=doc_id, text=text, metadata=metadata, distance=distance))

    return docs
