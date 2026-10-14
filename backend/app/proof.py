"""Public proof that the autopilot really runs: a demo pot on Monad testnet
watched by the same Chainlink CRE workflow as users' pots.

GET  /proof      - the Chainlink run log for the demo pot, its on-chain ledger
                   (paydays in, creditor payouts out, with tx hashes) and the
                   bank transfers the payout worker made from those payouts.
POST /proof/run  - anyone (a judge) can send a GBP135 test payday into the
                   demo pot and watch the rest happen by itself. Rate-limited.
"""
from __future__ import annotations

import os
import re
import threading
import time
from pathlib import Path

import httpx
from eth_abi import decode
from eth_utils import keccak
from fastapi import APIRouter, HTTPException

from app.openbanking import onramp, store
from app.payouts import worker

DEMO_POT = os.environ.get("DEMO_POT_ADDRESS", "0x79d46f5b8bde606354dfe0eb3d59b9d1ef80d298").lower()
DEMO_AUTOMATION = os.environ.get("DEMO_AUTOMATION_ADDRESS", "0x7d00c39460995483856d321c56a19703d08c8589").lower()
RECEIVER = "0x95f9aA834e0e9B9930B3a6ebE63053143BE2245f"
FORWARDER = "0xB9F79d863261869B234c481D1f9A7af84AeAd192"
DEPLOY_BLOCK = 70805600
CRE_LOG = Path(os.environ.get("CRE_LOG_PATH", "/cre/breathing-room-cre.log"))
DEMO_PAYDAY_GBP = 135.0
RUN_COOLDOWN = 150  # one demo payday per Chainlink cycle or so

PAYDAY_TOPIC = "0x" + keccak(text="PaydayReceived(address,uint256)").hex()
PAID_TOPIC = worker.CREDITOR_PAID_TOPIC

router = APIRouter(prefix="/proof", tags=["proof"])
_lock = threading.Lock()
_ledger: list[dict] = []
_scanned = DEPLOY_BLOCK - 1
_last_run = 0.0


def _rpc(method: str, params: list):
    return worker._rpc(method, params)


def scan() -> None:
    """Index new demo-pot events (called every few seconds from main's loop)."""
    global _scanned
    head = int(_rpc("eth_blockNumber", []), 16)
    start = _scanned + 1
    new: list[dict] = []
    for chunk_start in range(start, head + 1, worker.CHUNK):
        end = min(chunk_start + worker.CHUNK - 1, head)
        logs = _rpc("eth_getLogs", [{"address": DEMO_POT, "topics": [[PAYDAY_TOPIC, PAID_TOPIC]], "fromBlock": hex(chunk_start), "toBlock": hex(end)}])
        for log in logs:
            if log["topics"][0] == PAYDAY_TOPIC:
                (amount,) = decode(["uint256"], bytes.fromhex(log["data"][2:]))
                new.append({"kind": "payday", "label": "Payday into the pot", "amount_gbp": round(amount / 1e18 / onramp.GBP_TO_MON_RATE, 2)})
            else:
                label, amount, priority = decode(["string", "uint256", "bool"], bytes.fromhex(log["data"][2:]))
                if amount == 0:
                    continue  # the debtor's zero living-costs line
                new.append({"kind": "paid", "label": label, "priority": priority, "amount_gbp": round(amount / 1e18 / onramp.GBP_TO_MON_RATE, 2)})
            new[-1].update(tx=log["transactionHash"], block=int(log["blockNumber"], 16), log_index=int(log["logIndex"], 16))
        _scanned = end
    if new:
        for e in new:
            block = _rpc("eth_getBlockByNumber", [hex(e["block"]), False])
            e["at"] = int(block["timestamp"], 16)
        with _lock:
            _ledger.extend(new)
            del _ledger[:-60]


def pay_out() -> None:
    """Demo-pot payouts to bank transfers, faster than the main 2-minute loop."""
    head = int(_rpc("eth_blockNumber", []), 16)
    try:
        worker.pay_out_wallet(DEMO_POT, head)
    except Exception as exc:
        store.add_event(DEMO_POT, f"Creditor payout hit a problem: {exc}"[:300])
        raise


def _runs(limit: int = 8) -> list[dict]:
    if not CRE_LOG.exists():
        return []
    text = CRE_LOG.read_bytes()[-200_000:].decode(errors="replace")
    runs = []
    # Each run starts with a "=== <time> [<target>]" line (the workflow's own
    # output also contains "===", so split on the full header line).
    parts = re.split(r"^=== (\S+) \[([\w-]+)\]$", text, flags=re.M)
    for at, target, block in zip(parts[1::3], parts[2::3], parts[3::3]):
        if target != "demo-settings":
            continue
        tx = re.search(r"Success! TX: (0x[0-9a-fA-F]{64})", block)
        runs.append(
            {
                "at": at,
                "outcome": "paid" if tx else ("checked" if "not needed" in block else "error"),
                "tx": tx.group(1) if tx else None,
            }
        )
    return runs[-limit:][::-1]


@router.get("")
def get_proof() -> dict:
    record = store.get(DEMO_POT)
    transfers = [e for e in record.get("events", []) if "by bank transfer" in e["text"]][:12]
    with _lock:
        ledger = list(reversed(_ledger))[:30]
    balance_wei = int(_rpc("eth_getBalance", [DEMO_POT, "latest"]), 16)
    return {
        "creditors": [
            {"label": c["label"], "reference": c.get("reference")} for c in (record.get("plan") or {}).get("creditors", [])
        ],
        "addresses": {"pot": DEMO_POT, "automation": DEMO_AUTOMATION, "receiver": RECEIVER, "forwarder": FORWARDER},
        "explorer": "https://testnet.monadscan.com",
        "pot_balance_gbp": round(balance_wei / 1e18 / onramp.GBP_TO_MON_RATE, 2),
        "runs": _runs(),
        "ledger": ledger,
        "transfers": transfers,
        "next_run_in": max(0, int(RUN_COOLDOWN - (time.time() - _last_run))),
    }


@router.post("/run")
def run_demo(body: dict | None = None) -> dict:
    """Send a test payday of the visitor's chosen size (GBP10 to GBP500)."""
    global _last_run
    try:
        amount = round(float((body or {}).get("amount_gbp", DEMO_PAYDAY_GBP)), 2)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Please enter an amount in pounds.")
    if not 10 <= amount <= 500:
        raise HTTPException(status_code=422, detail="Please choose an amount between £10 and £500.")
    with _lock:
        if time.time() - _last_run < RUN_COOLDOWN:
            raise HTTPException(status_code=429, detail="A demo payday is already on its way. Watch it land, then try again in a couple of minutes.")
        _last_run = time.time()
    if int(_rpc("eth_getBalance", [DEMO_POT, "latest"]), 16) > 0:
        raise HTTPException(status_code=409, detail="The last payday is still being paid out. Give it a minute.")
    try:
        tx = onramp.send_to_pot(DEMO_POT, amount)
    except Exception:
        _last_run = 0.0
        raise HTTPException(status_code=502, detail="Couldn't send the test payday just now. Please try again.")
    store.add_event(DEMO_POT, f"Demo payday of £{amount:.2f} sent into the pot.")
    return {"tx": tx, "amount_gbp": amount}
