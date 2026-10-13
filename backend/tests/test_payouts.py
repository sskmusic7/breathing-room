import pytest
from eth_abi import encode

from app.openbanking import store
from app.payouts import worker

WALLET = "0x" + "ab" * 20
POT = "0x" + "cd" * 20
SETTLEMENT = "0x" + "07" * 20


def _log(label, amount_gbp, to=SETTLEMENT, tx="0x" + "11" * 32, idx=0):
    wei = int(amount_gbp * worker.onramp.GBP_TO_MON_RATE * 10**18)
    return {
        "topics": [worker.CREDITOR_PAID_TOPIC, "0x" + "0" * 24 + to[2:]],
        "data": "0x" + encode(["string", "uint256", "bool"], [label, wei, False]).hex(),
        "transactionHash": tx,
        "logIndex": hex(idx),
    }


@pytest.fixture
def plan(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "STATE_PATH", tmp_path / "bank.json")
    monkeypatch.setenv("SETTLEMENT_ADDRESS", SETTLEMENT)
    store.update(
        WALLET,
        plan={
            "pot_address": POT,
            "surplus_gbp": 100,
            "creditors": [
                {"label": "Lambeth Council", "sort_code": "40-11-62", "account_no": "12345678", "reference": "PCN LB123456"},
            ],
        },
    )
    paid = []
    monkeypatch.setattr(worker.revolut, "counterparty_id", lambda name, sc, acc, *address: f"cp-{acc}")
    monkeypatch.setattr(worker.revolut, "pay", lambda cp, amount, ref, request_id: paid.append((cp, round(amount, 2), ref, request_id)))
    return paid


def test_on_chain_payout_becomes_one_gbp_transfer_with_reference(plan, monkeypatch):
    logs = [_log("Lambeth Council", 12.40), _log("Debtor (living costs + savings)", 300, idx=1)]
    monkeypatch.setattr(worker, "_logs", lambda pot, s, e: logs if s <= 1000 <= e else [])
    worker.pay_out_wallet(WALLET, head=1000)
    assert len(plan) == 1  # the debtor's own essentials payout is not a creditor transfer
    assert plan[0][:3] == ("cp-12345678", 12.4, "PCN LB123456")

    worker.pay_out_wallet(WALLET, head=1000)  # rescanning never pays twice
    store.update(WALLET, payout_scanned_block=900)
    worker.pay_out_wallet(WALLET, head=1000)
    assert len(plan) == 1


def test_ignores_payouts_not_sent_to_the_settlement_address(plan, monkeypatch):
    logs = [_log("Lambeth Council", 12.40, to="0x" + "99" * 20)]
    monkeypatch.setattr(worker, "_logs", lambda pot, s, e: logs if s <= 1000 <= e else [])
    worker.pay_out_wallet(WALLET, head=1000)
    assert plan == []


def test_request_id_unique_per_creditor_in_one_sweep():
    """Several creditors are paid in one transaction; each needs its own Revolut key."""
    from app.payouts.worker import request_id
    tx = "0x7dcda55fb1b9d03fe77173746b229266eaa69b67996e7040912ea6c996293d3f"
    ids = {request_id(f"{tx}:{i}") for i in (6, 7, 8)}
    assert len(ids) == 3
    assert all(len(i) <= 40 for i in ids)
