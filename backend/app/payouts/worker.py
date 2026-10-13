"""Turns on-chain creditor payouts into real GBP bank transfers.

Each pot pays creditors' shares on-chain (DebtPots `CreditorPaid` events) to
a settlement address. This worker reads those events and sends the same
amount in GBP via Revolut to the creditor's own bank account, with the
creditor's reference, so they can match it. The tx hash + log index is the
idempotency key: one on-chain payout -> exactly one bank transfer.
"""
from __future__ import annotations

import hashlib
import os

import httpx
from eth_abi import decode

from app.openbanking import onramp, store
from . import revolut

# Log scans stay on the public RPC: Alchemy's free tier caps eth_getLogs at 10
# blocks, ours scans 100 at a time. Transactions and reads use Alchemy (MONAD_RPC_URL).
MONAD_RPC = os.environ.get("MONAD_LOGS_RPC_URL", "https://testnet-rpc.monad.xyz")
# keccak256("CreditorPaid(address,string,uint256,bool)")
CREDITOR_PAID_TOPIC = "0x6753e6016ce2ff370380bfe43a8f540e09922470c85350aa290e7a4d206d115d"
CHUNK = 100  # Monad public RPC caps eth_getLogs at 100 blocks
MAX_CHUNKS_PER_RUN = 60
FIRST_RUN_LOOKBACK = 3000


def _rpc(method: str, params: list):
    body = httpx.post(MONAD_RPC, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=20).json()
    if "error" in body:
        raise RuntimeError(f"{method}: {body['error']}")
    return body["result"]


def _settlement_address() -> str:
    return os.environ.get("SETTLEMENT_ADDRESS", "").lower()


def _logs(pot: str, start: int, end: int) -> list[dict]:
    return _rpc(
        "eth_getLogs",
        [{"address": pot, "topics": [CREDITOR_PAID_TOPIC], "fromBlock": hex(start), "toBlock": hex(end)}],
    )


def _decode(log: dict) -> dict:
    label, amount_wei, is_priority = decode(["string", "uint256", "bool"], bytes.fromhex(log["data"][2:]))
    return {
        "wallet": "0x" + log["topics"][1][-40:],
        "label": label,
        "amount_gbp": amount_wei / 10**18 / onramp.GBP_TO_MON_RATE,
        "key": f"{log['transactionHash']}:{int(log['logIndex'], 16)}",
        "tx": log["transactionHash"],
    }


def request_id(key: str) -> str:
    """Revolut's idempotency key (max 40 chars), unique per on-chain payout.

    One sweep pays several creditors in the same transaction, so the key must
    include the log index: truncating "txhash:index" to 40 chars made every
    creditor after the first a "duplicate request".
    """
    return hashlib.sha1(key.encode()).hexdigest()


def pay_out_wallet(wallet: str, head: int) -> None:
    record = store.get(wallet)
    plan = record.get("plan") or {}
    pot = plan.get("pot_address")
    creditors = {c["label"]: c for c in plan.get("creditors", []) if c.get("sort_code") and c.get("account_no")}
    if not pot or not creditors:
        return

    start = record.get("payout_scanned_block", head - FIRST_RUN_LOOKBACK) + 1
    paid = set(record.get("payouts_done", []))
    end = start - 1
    for chunk_start in range(start, head + 1, CHUNK):
        if (chunk_start - start) // CHUNK >= MAX_CHUNKS_PER_RUN:
            break
        end = min(chunk_start + CHUNK - 1, head)
        for log in _logs(pot, chunk_start, end):
            event = _decode(log)
            creditor = creditors.get(event["label"])
            if event["key"] in paid or not creditor or event["wallet"].lower() != _settlement_address():
                continue
            counterparty = revolut.counterparty_id(
                creditor["label"],
                creditor["sort_code"],
                creditor["account_no"],
                creditor.get("address", ""),
                creditor.get("city", ""),
                creditor.get("postcode", ""),
            )
            reference = creditor.get("reference") or "Breathing Room payment"
            revolut.pay(counterparty, event["amount_gbp"], reference, request_id=request_id(event["key"]))
            paid.add(event["key"])
            store.update(wallet, payouts_done=sorted(paid))
            store.add_event(
                wallet,
                f"£{event['amount_gbp']:.2f} paid to {creditor['label']} by bank transfer, ref {reference}.",
            )
    store.update(wallet, payout_scanned_block=end)


def run_all() -> None:
    if not (revolut.connected() and _settlement_address()):
        return
    head = int(_rpc("eth_blockNumber", []), 16)
    for wallet in store.all_wallets():
        try:
            pay_out_wallet(wallet, head)
        except Exception as exc:  # one user's failure mustn't block the others
            store.add_event(wallet, f"Creditor payout hit a problem: {exc}"[:300])
