"""Deterministic Standard Financial Statement (SFS) calculator.

Implements the exact statutory hierarchy used by UK debt advice charities
(National Debtline / Business Debtline / StepChange) and required to be
"SFS Membership" compliant with the Money and Pensions Service (MaPS):

    Net Disposable Income (NDI) = Total Income - (Fixed Costs + Flexible Costs)
    Surplus for Creditors       = NDI - Savings Buffer

Priority debts (fines, council tax, HMRC, court orders) are protected first,
via a fixed token offer, when the surplus can't sustainably cover them.
Whatever surplus remains is split pro-rata across non-priority creditors by
outstanding balance.

This module is intentionally free of any LLM/RAG dependency: the money maths
must be deterministic and auditable, not a hallucination risk. The RAG layer
(app/rag) only ever handles legal text drafting, never the numbers.
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from .models import (
    CreditorAllocation,
    DebtCategory,
    SfsRequest,
    SfsResult,
)

TWO_PLACES = Decimal("0.01")
# NOT a statutory figure: a practical debt-advice-sector convention (the upper
# bound of the statutory GBP5-GBP25 savings buffer is used as a proxy) for
# "this household's disposable surplus is so thin that per-creditor pro-rata
# pennies aren't practically collectible" -> non-CCJ non-priority creditors get
# a flat GBP1/month token instead of their exact fractional strict share.
LOW_SURPLUS_THRESHOLD = Decimal("25.00")
DEFAULT_TOKEN_OFFER = Decimal("1.00")
BPS_DENOMINATOR = Decimal("10000")


def _money(value: Decimal) -> Decimal:
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def calculate_sfs(request: SfsRequest) -> SfsResult:
    total_income = request.income.total
    total_outgoings = request.outgoings.total

    net_disposable_income = total_income - total_outgoings
    surplus_for_creditors = net_disposable_income - request.savings_buffer

    # Negative surplus is clamped to zero for allocation purposes; the deficit
    # itself is still surfaced to the caller via net_disposable_income so the
    # UI/RAG letter-drafter can flag "you cannot sustainably afford this plan".
    allocatable_surplus = max(surplus_for_creditors, Decimal("0"))
    is_token_territory = allocatable_surplus < LOW_SURPLUS_THRESHOLD

    priority = [c for c in request.creditors if c.category == DebtCategory.PRIORITY]
    non_priority = [c for c in request.creditors if c.category == DebtCategory.NON_PRIORITY]

    total_non_priority_debt = sum((c.balance for c in non_priority), Decimal("0"))

    allocations: list[CreditorAllocation] = []

    # 1. Priority creditors (HMRC, council tax, court orders) are negotiated on
    # a separate track directly with each creditor, using the household's full
    # budget context -- not carved out of the same pot being split across
    # non-priority creditors below. In hardship cases this typically lands on
    # the same nominal GBP1/month "holding" offer used for non-priority tokens.
    for c in priority:
        offer = c.priority_token_offer if c.priority_token_offer is not None else DEFAULT_TOKEN_OFFER
        allocations.append(
            CreditorAllocation(
                creditor_id=c.id,
                name=c.name,
                category=c.category,
                balance=c.balance,
                debt_share_pct=Decimal("0"),
                strict_pro_rata_share=Decimal("0.00"),
                pragmatic_offer=_money(offer),
                pro_rata_share_bps=0,
            )
        )

    # 2. Non-priority creditors split the full disposable surplus strictly
    # pro-rata by outstanding balance (the SFS "debt weight" formula):
    #   payment_to_X = surplus_available * (balance_X / total_non_priority_debt)
    for c in non_priority:
        if total_non_priority_debt > 0:
            share_pct = _money((c.balance / total_non_priority_debt) * Decimal("100"))
            strict_share = allocatable_surplus * (c.balance / total_non_priority_debt)
            bps = int((c.balance / total_non_priority_debt * BPS_DENOMINATOR).to_integral_value())
        else:
            share_pct = Decimal("0.00")
            strict_share = Decimal("0")
            bps = 0

        strict_share_rounded = _money(strict_share)

        # Pragmatic offer:
        #  - A debt already under a County Court Judgment keeps its real strict
        #    pro-rata share (to be formalised via Form N245 variation), however
        #    small, because a court-ordered minimum is already in force.
        #  - Any other non-priority creditor gets a flat GBP1 token offer once
        #    the household is in "token payment territory" (total surplus below
        #    the statutory GBP5 threshold) — collecting exact pennies isn't
        #    practical, and SFS practice standardises on a round token instead.
        #  - Outside token territory, the strict pro-rata share is used as-is.
        if c.is_ccj:
            pragmatic_offer = strict_share_rounded
        elif is_token_territory:
            pragmatic_offer = DEFAULT_TOKEN_OFFER
        else:
            pragmatic_offer = strict_share_rounded

        allocations.append(
            CreditorAllocation(
                creditor_id=c.id,
                name=c.name,
                category=c.category,
                balance=c.balance,
                debt_share_pct=share_pct,
                strict_pro_rata_share=strict_share_rounded,
                pragmatic_offer=pragmatic_offer,
                pro_rata_share_bps=bps,
            )
        )

    return SfsResult(
        total_income=_money(total_income),
        total_outgoings=_money(total_outgoings),
        net_disposable_income=_money(net_disposable_income),
        savings_buffer=_money(request.savings_buffer),
        surplus_for_creditors=_money(surplus_for_creditors),
        is_token_payment_territory=is_token_territory,
        allocations=allocations,
    )
