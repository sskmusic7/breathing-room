# Regulatory guardrails

Breathing Room operates in three regulated zones (debt advice, legal
services, money movement). Staying on the right side of each boundary is a
product requirement, not an afterthought - see also `docs/data_protection.md`.

## 1. FCA - "debt counselling" / "debt adjusting"

Regulated under the Financial Services and Markets Act 2000 (Regulated
Activities Order 2001, arts 39E-39F). Breathing Room must **not**:
- negotiate directly with a creditor as the user's appointed representative;
- present its SFS output as bespoke regulated debt advice.

Instead it positions itself as an informational self-help tool built on the
public Standard Financial Statement (SFS) standard issued by the Money and
Pensions Service (MaPS), with clear signposting: *"This tool provides
standard SFS calculations. For formal, regulated debt advice, contact
National Debtline, StepChange, or Citizens Advice."*

**To operate properly (not yet done - see README "What's still needed"):**
apply for a free **SFS Membership number** from MaPS so budgets carry
official trigger-figure branding creditors recognise.

## 2. Legal Services Act 2007 - reserved legal activities

"Conduct of litigation" (issuing/conducting court proceedings) and certain
other activities are reserved to authorised persons. Drafting a letter or
form for someone to review, sign, and submit **themselves** is not a
reserved activity.

Every generated letter (see `app/rag/draft.py`) is a **draft**: the app
never submits, signs, or files anything on the user's behalf, and every
letter ends with:

> Breathing Room provides legal information and software tools, not legal
> advice. You are responsible for reviewing and sending your own appeals.

This is also the entire reason `DebtPots.sol` never auto-negotiates with a
court or creditor - it only ever moves money the user has already agreed a
plan for.

## 3. Money movement - FCA Open Banking / payment services

- **Read-only Open Banking**: integrate via an existing authorised Account
  Information Service Provider (AISP) - e.g. TrueLayer, Yapily, or Plaid -
  under their agency model, rather than applying for a bespoke FCA AISP
  licence (a months-long process).
- **Non-custodial execution**: `DebtPots.sol` never takes custody of fiat.
  The debtor's own embedded wallet (Privy) forwards a payday surplus into a
  contract *they own* (`Ownable(debtor)`), which only ever pays out to a
  pre-authorised creditor table the debtor themselves set via
  `setCreditors`. Breathing Room the company is never a money-transmission
  business.

## What's NOT built yet (be honest with judges about this)

- No live Open Banking integration (`app/openbanking/` is an empty stub) -
  the SFS calculator accepts manually-entered or mocked income/outgoings
  today.
- No SFS Membership number applied for yet.
- No ICO Data Controller registration completed yet (see
  `docs/data_protection.md`).
