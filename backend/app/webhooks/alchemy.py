"""Alchemy Notify webhook receiver.

Purpose: turn an on-chain "payday deposit landed in a DebtPots contract"
event into an off-chain push notification for the user, WITHOUT that
notification path being able to trigger money movement itself - the actual
sweep is Chainlink Automation's job (see contracts/src/DebtPotsAutomation.sol),
triggered independently on-chain. This keeps the two concerns cleanly split:
Alchemy Notify = "tell the user something happened", Chainlink Automation =
"make the payment happen". Neither depends on the other being online.

Signature verification follows Alchemy's documented scheme exactly:
HMAC-SHA256 of the raw request body, using the app's webhook signing key
(from the Alchemy dashboard), compared against the `X-Alchemy-Signature`
header. See https://www.alchemy.com/docs/reference/notify-api-quickstart
"""
from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from decimal import Decimal


def verify_signature(raw_body: bytes, signature: str, signing_key: str) -> bool:
    """Returns True iff `signature` matches HMAC-SHA256(signing_key, raw_body).

    Uses hmac.compare_digest (constant-time) rather than `==`, since this is
    a security-sensitive comparison - a timing side-channel here would let an
    attacker forge webhook calls by guessing the signature byte-by-byte.
    """
    digest = hmac.new(signing_key.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature)


@dataclass
class PaydayDepositEvent:
    contract_address: str
    from_address: str
    value_wei: int
    tx_hash: str
    network: str


def parse_address_activity(payload: dict) -> list[PaydayDepositEvent]:
    """Parses an Alchemy "Address Activity" webhook payload into
    PaydayDepositEvent objects - one per incoming native-token transfer into
    a watched DebtPots address.

    Payload shape (Alchemy Address Activity webhook):
      {"webhookId": "...", "id": "...", "createdAt": "...",
       "type": "ADDRESS_ACTIVITY",
       "event": {"network": "MONAD_TESTNET", "activity": [
          {"fromAddress": "0x...", "toAddress": "0x...", "value": 0.5,
           "asset": "MON", "category": "external", "hash": "0x..."},
          ...
       ]}}

    Only incoming native-asset transfers are treated as payday deposits;
    everything else (outgoing, token transfers, internal calls) is ignored
    here - DebtPots only ever needs to know when it *received* funds.
    """
    event = payload.get("event", {})
    network = event.get("network", "unknown")
    events: list[PaydayDepositEvent] = []

    for activity in event.get("activity", []):
        if activity.get("category") not in ("external", "internal"):
            continue
        value = activity.get("value")
        if value is None:
            continue

        events.append(
            PaydayDepositEvent(
                contract_address=activity.get("toAddress", ""),
                from_address=activity.get("fromAddress", ""),
                value_wei=int(Decimal(str(value)) * Decimal(10**18)),
                tx_hash=activity.get("hash", ""),
                network=network,
            )
        )

    return events


def notify_payday_deposit(event: PaydayDepositEvent) -> None:
    """Stub notification hook.

    In production this calls the frontend's web-push endpoint (already
    scaffolded by the Monad Privy PWA starter template at
    frontend/app/notification/) with a message like "Payday detected -
    your sweep will execute automatically shortly." Not wired up yet:
    doing so needs a real subscription-storage backend (today the template
    only has TODO comments for that - see frontend/README.md's own
    "Backend Integration Required" section), which is out of scope for
    this webhook receiver itself.
    """
    print(f"[alchemy webhook] payday deposit detected: {event}")
