"""Simulated fiat -> on-chain on-ramp for the demo.

Once TrueLayer reports the payday collection as executed, the same GBP amount
is sent into the user's DebtPots on Monad testnet, at the frontend's demo rate.
In production this hop is a regulated on-ramp partner converting GBP to a
stablecoin; it's the one simulated step in the money path, and the app says so.
"""
from __future__ import annotations

import os
import time

import httpx
from eth_account import Account

MONAD_RPC = os.environ.get("MONAD_RPC_URL", "https://testnet-rpc.monad.xyz")
MONAD_CHAIN_ID = 10143
# Must match GBP_TO_MON_RATE in frontend/app/lib/contracts.ts.
GBP_TO_MON_RATE = 0.00001
# Monad bills the full gas limit, so keep it tight (a plain transfer into
# DebtPots.receive() emits one event).
GAS_LIMIT = 60_000


def _rpc(method: str, params: list) -> object:
    resp = httpx.post(MONAD_RPC, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=20)
    body = resp.json()
    if "error" in body:
        raise RuntimeError(f"{method}: {body['error']}")
    return body["result"]


def is_configured() -> bool:
    return bool(os.environ.get("ONRAMP_PRIVATE_KEY"))


def send_to_pot(pot_address: str, amount_gbp: float) -> str:
    account = Account.from_key(os.environ["ONRAMP_PRIVATE_KEY"])
    value = int(amount_gbp * GBP_TO_MON_RATE * 10**18)
    tx = {
        "to": pot_address,
        "value": value,
        "gas": GAS_LIMIT,
        "gasPrice": int(_rpc("eth_gasPrice", []), 16),
        "nonce": int(_rpc("eth_getTransactionCount", [account.address, "pending"]), 16),
        "chainId": MONAD_CHAIN_ID,
    }
    signed = account.sign_transaction(tx)
    tx_hash = _rpc("eth_sendRawTransaction", ["0x" + signed.raw_transaction.hex().removeprefix("0x")])
    for _ in range(30):
        receipt = _rpc("eth_getTransactionReceipt", [tx_hash])
        if receipt:
            if receipt["status"] != "0x1":
                raise RuntimeError(f"on-ramp transfer reverted: {tx_hash}")
            return tx_hash
        time.sleep(1)
    return tx_hash
