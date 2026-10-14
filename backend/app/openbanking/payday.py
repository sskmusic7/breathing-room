"""Payday detection and automatic surplus collection.

One cycle per linked user (run every couple of minutes, or on demand):
  1. A collection already in flight? Check its TrueLayer status; once
     executed, on-ramp the money into the user's pot. Chainlink CRE then
     sees the deposit and pays creditors.
  2. Otherwise read recent transactions; on a new payday credit, collect
     the user's planned surplus over their VRP mandate.
Only the surplus is ever collected: essentials stay in the user's bank.
Collection goes through whichever provider the user approved (collectors.py).
"""
from __future__ import annotations

import os

import re
from datetime import datetime, timedelta, timezone

from . import collectors, onramp, store, truelayer

SALARY_PATTERN = re.compile(r"salary|payroll|wages|pay\b|bacs", re.IGNORECASE)
MIN_PAYDAY_GBP = 300.0


def summarise_budget(transactions: list[dict]) -> dict:
    """Average monthly income / fixed / flexible outgoings from real
    transactions, for the SFS form. Averages over the span the bank actually
    returned (1 to 3 months), which smooths irregular income."""
    fixed_categories = {"DIRECT_DEBIT", "STANDING_ORDER", "BILL_PAYMENT"}
    income = fixed = flexible = 0.0
    for t in transactions:
        amount = float(t.get("amount", 0))
        if amount > 0:
            income += amount
        elif t.get("transaction_category") in fixed_categories:
            fixed += -amount
        else:
            flexible += -amount
    dates = sorted(datetime.fromisoformat(t["timestamp"].replace("Z", "+00:00")) for t in transactions if t.get("timestamp"))
    span_days = (dates[-1] - dates[0]).days if len(dates) > 1 else 30
    months = min(3.0, max(1.0, round(span_days / 30.4, 1)))
    return {
        "employment": round(income / months, 2),
        "fixed_costs": round(fixed / months, 2),
        "flexible_costs": round(flexible / months, 2),
        "months": round(months, 1),
    }


def find_payday(transactions: list[dict], processed: set[str]) -> dict | None:
    """Newest unprocessed salary-looking credit; falls back to the largest
    unprocessed credit over MIN_PAYDAY_GBP (sandbox data rarely says "SALARY")."""
    credits = [
        t for t in transactions
        if float(t.get("amount", 0)) >= MIN_PAYDAY_GBP and t.get("transaction_id") not in processed
    ]
    if not credits:
        return None
    salary = [t for t in credits if SALARY_PATTERN.search(t.get("description", ""))]
    if salary:
        return max(salary, key=lambda t: t.get("timestamp", ""))
    return max(credits, key=lambda t: float(t["amount"]))


# One automatic collection per pay cycle, however many salary-sized credits
# appear: a second collection in the same month is never safe to assume.
COOLDOWN_DAYS = float(os.environ.get("PAYDAY_COOLDOWN_DAYS", "25"))


def run_cycle(wallet: str, manual: bool = False) -> None:
    """`manual` = the user tapped "Check for payday now": skips the cooldown."""
    record = store.get(wallet)
    if not record.get("tokens") or record.get("mandate_status") != "authorized":
        return
    plan = record.get("plan") or {}
    if not plan.get("pot_address") or not plan.get("surplus_gbp"):
        return

    collector = collectors.ALL[record["collector"]]
    pending = record.get("pending_payment")
    if pending:
        status = collector.payment_status(pending["id"])
        if status == "executed":
            tx = onramp.send_to_pot(plan["pot_address"], pending["amount_gbp"])
            store.update(wallet, pending_payment=None, last_onramp_tx=tx)
            store.add_event(wallet, f"£{pending['amount_gbp']:.2f} collected from your bank and moved into your pot. Chainlink will pay your creditors within a couple of minutes.")
        elif status == "failed":
            store.update(wallet, pending_payment=None)
            store.add_event(wallet, f"Bank collection of £{pending['amount_gbp']:.2f} failed. Nothing was taken.")
        return

    last = record.get("last_collected_at")
    if last and not manual:
        age = datetime.now(timezone.utc) - datetime.fromisoformat(last)
        if age < timedelta(days=COOLDOWN_DAYS):
            return

    tokens = truelayer.refresh_data_tokens(record["tokens"])
    if tokens is not record["tokens"]:
        store.update(wallet, tokens=tokens)
    processed = set(record.get("processed_paydays", []))
    payday = find_payday(truelayer.get_transactions(tokens["access_token"]), processed)
    if not payday:
        return

    amount = min(float(plan["surplus_gbp"]), float(payday["amount"]))
    payment_id = collector.collect(record["mandate_ref"], amount, "BR PAYDAY")
    store.update(
        wallet,
        processed_paydays=[*processed, payday["transaction_id"]],
        pending_payment={"id": payment_id, "amount_gbp": amount, "payday_id": payday["transaction_id"]},
        last_collected_at=datetime.now(timezone.utc).isoformat(),
    )
    store.add_event(
        wallet,
        f"Payday spotted: £{float(payday['amount']):.2f} ({payday.get('description', 'credit')}). Collecting your £{amount:.2f} surplus. Essentials stay in your bank.",
    )


def run_all() -> None:
    for wallet in store.all_wallets():
        try:
            run_cycle(wallet)
        except Exception as exc:  # one user's failure mustn't stop the others
            store.add_event(wallet, f"Payday check hit a problem: {exc}"[:300])
