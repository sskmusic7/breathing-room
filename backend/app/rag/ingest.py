"""Ingests the local legal corpus (backend/data/legal_corpus/*.md) into a
local, on-disk Chroma vector store.

Deliberately NOT using GCP Vertex AI RAG Engine here: this account's GCP
billing is currently deactivated, and more importantly, a local vector store
means the statutory corpus lives entirely in-house (per the blueprint's own
"keep stuff in house" requirement) with zero cloud dependency for the core
legal-matching feature. Swap the embedding function for a hosted one later
if/when GCP billing is restored, without changing any calling code.

Chunking strategy: one chunk per corpus file's frontmatter + body (files are
already short, single-topic documents), tagged with the frontmatter metadata
so retrieval can filter by issuer_type / stage_of_notice / jurisdiction /
category before falling back to pure semantic similarity.
"""
from __future__ import annotations

import re
from pathlib import Path

import chromadb

CORPUS_DIR = Path(__file__).resolve().parents[2] / "data" / "legal_corpus"
CHROMA_DIR = Path(__file__).resolve().parents[2] / "data" / "chroma"
COLLECTION_NAME = "breathing_room_legal_corpus"

_FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.DOTALL)


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    match = _FRONTMATTER_RE.match(text)
    if not match:
        return {}, text

    raw_meta, body = match.groups()
    meta: dict[str, str] = {}
    for line in raw_meta.splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()
    return meta, body.strip()


def load_corpus() -> list[dict]:
    """Returns a list of {id, text, metadata} for every corpus document."""
    docs = []
    for path in sorted(CORPUS_DIR.glob("*.md")):
        meta, body = _parse_frontmatter(path.read_text(encoding="utf-8"))
        doc_id = meta.get("id", path.stem)
        docs.append(
            {
                "id": doc_id,
                "text": body,
                "metadata": {
                    "title": meta.get("title", path.stem),
                    "category": meta.get("category", "uncategorised"),
                    "issuer_type": meta.get("issuer_type", "unknown"),
                    "stage_of_notice": meta.get("stage_of_notice", "any"),
                    "jurisdiction": meta.get("jurisdiction", "unknown"),
                    "citation": meta.get("citation", ""),
                    "source_file": path.name,
                },
            }
        )
    return docs


def get_client() -> chromadb.ClientAPI:
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(CHROMA_DIR))


def ingest(reset: bool = False) -> int:
    """Ingests every corpus doc into the local Chroma collection.

    Returns the number of documents ingested. Uses Chroma's bundled default
    embedding function (all-MiniLM-L6-v2, runs fully locally/offline after
    its first download) so this works with zero API keys.
    """
    client = get_client()

    if reset:
        try:
            client.delete_collection(COLLECTION_NAME)
        except Exception:
            pass

    collection = client.get_or_create_collection(COLLECTION_NAME)
    docs = load_corpus()

    collection.upsert(
        ids=[d["id"] for d in docs],
        documents=[d["text"] for d in docs],
        metadatas=[d["metadata"] for d in docs],
    )
    return len(docs)


if __name__ == "__main__":
    count = ingest(reset=True)
    print(f"Ingested {count} legal corpus documents into {CHROMA_DIR}")
