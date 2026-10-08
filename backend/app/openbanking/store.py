"""Tiny JSON-file store for linked banks, keyed by the user's wallet address.

Hackathon scale (a handful of testers), so a file on the container's state
volume is enough. Holds TrueLayer tokens, so the file never leaves the server.
"""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

STATE_PATH = Path(os.environ.get("BANK_STATE_PATH", Path(__file__).resolve().parents[2] / "data" / "state" / "bank.json"))
_lock = threading.Lock()


def _load() -> dict:
    if not STATE_PATH.exists():
        return {}
    return json.loads(STATE_PATH.read_text())


def _save(data: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(STATE_PATH)


def get(wallet: str) -> dict:
    with _lock:
        return _load().get(wallet.lower(), {})


def update(wallet: str, **fields) -> dict:
    with _lock:
        data = _load()
        record = data.setdefault(wallet.lower(), {})
        record.update(fields)
        _save(data)
        return record


def all_wallets() -> list[str]:
    with _lock:
        return list(_load().keys())


def add_event(wallet: str, text: str) -> None:
    with _lock:
        data = _load()
        record = data.setdefault(wallet.lower(), {})
        events = record.setdefault("events", [])
        events.insert(0, {"at": datetime.now(timezone.utc).isoformat(), "text": text})
        del events[20:]
        _save(data)
