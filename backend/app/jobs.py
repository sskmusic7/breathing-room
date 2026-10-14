"""Background jobs for the slow AI calls (drafting a letter ~100s, reading a
photo ~20s), so a phone that locks or switches apps mid-wait doesn't lose the
result: the app starts a job, then polls for it, and picks up where it left
off when it comes back.

In memory, because uvicorn runs one process here; jobs are kept for an hour.
"""
from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

from fastapi import APIRouter, HTTPException

KEEP_SECONDS = 3600
# KIMI allows one request at a time per account, so AI jobs queue rather than collide.
_pool = ThreadPoolExecutor(max_workers=1)
_jobs: dict[str, dict] = {}
_lock = threading.Lock()

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _prune() -> None:
    cutoff = time.time() - KEEP_SECONDS
    for jid in [j for j, v in _jobs.items() if v["created"] < cutoff]:
        del _jobs[jid]


def start(fn: Callable[[], dict], error_message: Callable[[Exception], str]) -> str:
    jid = uuid.uuid4().hex
    with _lock:
        _prune()
        _jobs[jid] = {"status": "pending", "created": time.time()}

    def run() -> None:
        try:
            result = fn()
            update = {"status": "done", "result": result}
        except Exception as exc:  # reported to the app, never raised
            update = {"status": "error", "error": error_message(exc)}
        with _lock:
            if jid in _jobs:
                _jobs[jid].update(update)

    _pool.submit(run)
    return jid


@router.get("/{job_id}")
def get_job(job_id: str) -> dict:
    with _lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="That request has expired. Please try again.")
    return {k: v for k, v in job.items() if k != "created"}
