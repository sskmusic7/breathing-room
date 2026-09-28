"""Data models for the Standard Financial Statement (SFS) engine.

These mirror the structure of the real Money and Pensions Service (MaPS)
Standard Financial Statement: fixed vs flexible outgoings, priority vs
non-priority debts, and a statutory savings buffer.
"""
from __future__ import annotations

from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field


class DebtCategory(str, Enum):
    PRIORITY = "priority"
    NON_PRIORITY = "non_priority"


class Creditor(BaseModel):
    """A single debt line from the user's SFS."""

    id: str
    name: str
    category: DebtCategory
    balance: Decimal = Field(ge=0, description="Outstanding balance in GBP")
    # A priority creditor can carry a fixed "token offer" (e.g. GBP1/month) that
    # is honoured before any pro-rata split of the remaining surplus.
    priority_token_offer: Decimal | None = Field(
        default=None, ge=0, description="Fixed token payment/month for priority debts"
    )
    # True for debts already under a County Court Judgment: the pragmatic offer
    # must be the real strict pro-rata share (varied via Form N245) rather than
    # a flat token, because a court-ordered minimum is already in force.
    is_ccj: bool = False


class Income(BaseModel):
    """Household income lines, matching the SFS income section."""

    employment_income: Decimal = Decimal("0")
    benefits_income: Decimal = Decimal("0")
    other_income: Decimal = Decimal("0")
    # Self-employed trading losses etc. reduce total income, matching the SFS
    # worked example (Universal Credit £591.76 minus £112.55 trading loss).
    deductions: Decimal = Decimal("0")

    @property
    def total(self) -> Decimal:
        return (
            self.employment_income
            + self.benefits_income
            + self.other_income
            - self.deductions
        )


class Outgoings(BaseModel):
    """Household spending, split fixed (housing, utilities) vs flexible
    (food, housekeeping, communication) per the SFS trigger-figure model.
    """

    fixed_costs: Decimal = Decimal("0")
    flexible_costs: Decimal = Decimal("0")

    @property
    def total(self) -> Decimal:
        return self.fixed_costs + self.flexible_costs


class SfsRequest(BaseModel):
    income: Income
    outgoings: Outgoings
    creditors: list[Creditor]
    savings_buffer: Decimal = Field(
        default=Decimal("5.00"),
        ge=Decimal("5.00"),
        le=Decimal("25.00"),
        description="Statutory SFS savings buffer, GBP5-GBP25/month",
    )


class CreditorAllocation(BaseModel):
    creditor_id: str
    name: str
    category: DebtCategory
    balance: Decimal
    debt_share_pct: Decimal  # of total non-priority debt, 0 for priority
    strict_pro_rata_share: Decimal  # GBP/month under strict SFS maths
    pragmatic_offer: Decimal  # what's actually proposed (token offer floor applied)
    pro_rata_share_bps: int  # for on-chain DebtPots.setCreditors()


class SfsResult(BaseModel):
    total_income: Decimal
    total_outgoings: Decimal
    net_disposable_income: Decimal
    savings_buffer: Decimal
    surplus_for_creditors: Decimal
    is_token_payment_territory: bool  # true if surplus < GBP5 (per doc's <£5 rule)
    allocations: list[CreditorAllocation]

    def to_debtpots_payload(self) -> dict:
        """JSON payload shape suitable for the DebtPots.sol setCreditors() call
        (via the on-chain agent / Privy embedded wallet transaction builder)."""
        return {
            "livingExpensesAllowanceWei": None,  # filled in by the caller with a wei conversion
            "savingsBufferWei": None,
            "creditors": [
                {
                    "label": a.name,
                    "debtBalanceWei": str(a.balance),
                    "proRataShareBps": a.pro_rata_share_bps,
                    "priorityFixedAmountWei": str(a.pragmatic_offer) if a.category == DebtCategory.PRIORITY else "0",
                    "isPriority": a.category == DebtCategory.PRIORITY,
                }
                for a in self.allocations
            ],
        }
