from decimal import Decimal

from app.sfs_engine.calculator import calculate_sfs
from app.sfs_engine.models import (
    Creditor,
    DebtCategory,
    Income,
    Outgoings,
    SfsRequest,
)


def _blueprint_request() -> SfsRequest:
    """The exact worked example from the Breathing Room blueprint's SFS
    validation: a Universal Credit household with a CCJ, an overdraft, a
    PayPal loan, a family loan, and a NatWest overdraft.
    """
    return SfsRequest(
        income=Income(
            benefits_income=Decimal("591.76"),
            deductions=Decimal("112.55"),
        ),
        outgoings=Outgoings(
            fixed_costs=Decimal("205.98"),
            flexible_costs=Decimal("262.00"),
        ),
        savings_buffer=Decimal("5.00"),
        creditors=[
            Creditor(
                id="hmrc",
                name="HMRC Income Tax",
                category=DebtCategory.PRIORITY,
                balance=Decimal("1679.69"),
                priority_token_offer=Decimal("1.00"),
            ),
            Creditor(
                id="aqua",
                name="Aqua/NewDay (CCJ)",
                category=DebtCategory.NON_PRIORITY,
                balance=Decimal("2834.00"),
                is_ccj=True,
            ),
            Creditor(
                id="halifax",
                name="Halifax Overdraft",
                category=DebtCategory.NON_PRIORITY,
                balance=Decimal("1096.23"),
            ),
            Creditor(
                id="paypal",
                name="PayPal Loan",
                category=DebtCategory.NON_PRIORITY,
                balance=Decimal("409.19"),
            ),
            Creditor(
                id="family",
                name="Family / Personal",
                category=DebtCategory.NON_PRIORITY,
                balance=Decimal("250.00"),
            ),
            Creditor(
                id="natwest",
                name="NatWest Overdrafts",
                category=DebtCategory.NON_PRIORITY,
                balance=Decimal("206.27"),
            ),
        ],
    )


def test_matches_blueprint_worked_example_totals():
    result = calculate_sfs(_blueprint_request())

    assert result.total_income == Decimal("479.21")
    assert result.total_outgoings == Decimal("467.98")
    assert result.net_disposable_income == Decimal("11.23")
    assert result.surplus_for_creditors == Decimal("6.23")
    assert result.is_token_payment_territory is True


def test_matches_blueprint_worked_example_allocations():
    result = calculate_sfs(_blueprint_request())
    by_id = {a.creditor_id: a for a in result.allocations}

    # Priority: HMRC held to its GBP1 token offer, out of the GBP6.23 surplus.
    assert by_id["hmrc"].pragmatic_offer == Decimal("1.00")

    # Aqua is under a CCJ: real strict pro-rata share of what's left after
    # HMRC's GBP1 (GBP5.23). Deliberate departure from the blueprint, which
    # splits the full GBP6.23 and so promises GBP7.23 out of GBP6.23: here one
    # collection pays everyone and DebtPots pays priority first.
    assert by_id["aqua"].debt_share_pct == Decimal("59.09")  # 59.1% at 1dp
    assert by_id["aqua"].strict_pro_rata_share == Decimal("3.09")
    assert by_id["aqua"].pragmatic_offer == by_id["aqua"].strict_pro_rata_share

    # Every other non-priority (non-CCJ) creditor is in low-surplus territory:
    # flat GBP1 token offers regardless of their own strict share.
    for cid in ("halifax", "paypal", "family", "natwest"):
        assert by_id[cid].pragmatic_offer == Decimal("1.00")

    # Sanity: strict shares are proportional to balance and sum to the
    # non-priority pot (GBP6.23 surplus minus HMRC's GBP1).
    strict_total = sum((a.strict_pro_rata_share for a in result.allocations), Decimal("0"))
    assert abs(strict_total - Decimal("5.23")) < Decimal("0.05")


def test_pro_rata_bps_sum_to_ten_thousand_across_non_priority():
    result = calculate_sfs(_blueprint_request())
    non_priority_bps = sum(
        a.pro_rata_share_bps for a in result.allocations if a.category == DebtCategory.NON_PRIORITY
    )
    # Rounding to integral bps can be off by a few units at most.
    assert abs(non_priority_bps - 10_000) <= 5


def test_zero_surplus_when_outgoings_exceed_income():
    request = SfsRequest(
        income=Income(employment_income=Decimal("900.00")),
        outgoings=Outgoings(fixed_costs=Decimal("700.00"), flexible_costs=Decimal("300.00")),
        creditors=[
            Creditor(id="c1", name="Catalogue debt", category=DebtCategory.NON_PRIORITY, balance=Decimal("500")),
        ],
    )
    result = calculate_sfs(request)

    assert result.net_disposable_income == Decimal("-100.00")
    assert result.surplus_for_creditors < 0
    assert result.is_token_payment_territory is True
    # No money to allocate: pragmatic offers must not go negative.
    assert all(a.pragmatic_offer >= 0 for a in result.allocations)


def test_healthy_surplus_uses_strict_pro_rata_not_flat_tokens():
    request = SfsRequest(
        income=Income(employment_income=Decimal("2500.00")),
        outgoings=Outgoings(fixed_costs=Decimal("900.00"), flexible_costs=Decimal("400.00")),
        savings_buffer=Decimal("25.00"),
        creditors=[
            Creditor(id="a", name="Creditor A", category=DebtCategory.NON_PRIORITY, balance=Decimal("3000")),
            Creditor(id="b", name="Creditor B", category=DebtCategory.NON_PRIORITY, balance=Decimal("1000")),
        ],
    )
    result = calculate_sfs(request)

    assert result.is_token_payment_territory is False
    by_id = {a.creditor_id: a for a in result.allocations}
    # 4:1 balance ratio should produce a matching 4:1 pragmatic-offer ratio,
    # not flattened token payments.
    ratio = by_id["a"].pragmatic_offer / by_id["b"].pragmatic_offer
    assert abs(ratio - Decimal("3")) < Decimal("0.05")


def test_plan_never_promises_more_than_the_surplus():
    """Priority first, then pro-rata of what's left: payments add up to the surplus."""
    from app.sfs_engine.models import Income, Outgoings, SfsRequest, Creditor, DebtCategory
    result = calculate_sfs(
        SfsRequest(
            income=Income(employment_income=Decimal("1640")),
            outgoings=Outgoings(fixed_costs=Decimal("1100"), flexible_costs=Decimal("400")),
            savings_buffer=Decimal("5"),
            creditors=[
                Creditor(id="ct", name="Council tax", category=DebtCategory.PRIORITY, balance=Decimal("400"), priority_token_offer=Decimal("60")),
                Creditor(id="pcn", name="Lambeth PCN", category=DebtCategory.NON_PRIORITY, balance=Decimal("70")),
                Creditor(id="cat", name="Catalogue", category=DebtCategory.NON_PRIORITY, balance=Decimal("600")),
            ],
        )
    )
    assert result.surplus_for_creditors == Decimal("135.00")
    total = sum((a.pragmatic_offer for a in result.allocations), Decimal("0"))
    assert abs(total - Decimal("135.00")) <= Decimal("0.02")


def test_no_creditor_is_paid_more_than_they_owe():
    """GBP195 spare against a GBP170 PCN: the PCN gets GBP170, the rest goes to the other debt."""
    from app.sfs_engine.models import Income, Outgoings, SfsRequest, Creditor, DebtCategory
    result = calculate_sfs(
        SfsRequest(
            income=Income(employment_income=Decimal("1700")),
            outgoings=Outgoings(fixed_costs=Decimal("1100"), flexible_costs=Decimal("400")),
            savings_buffer=Decimal("5"),
            creditors=[
                Creditor(id="pcn", name="PCN", category=DebtCategory.NON_PRIORITY, balance=Decimal("170")),
                Creditor(id="cat", name="Catalogue", category=DebtCategory.NON_PRIORITY, balance=Decimal("20")),
            ],
        )
    )
    by_id = {a.creditor_id: a for a in result.allocations}
    assert by_id["pcn"].pragmatic_offer <= Decimal("170")
    assert by_id["cat"].pragmatic_offer <= Decimal("20")
