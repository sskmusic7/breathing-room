---
id: cpr_n245
title: Civil Procedure Rules - Form N245 (Variation of a County Court Judgment)
category: debt_enforcement
issuer_type: court
stage_of_notice: ccj
jurisdiction: england_wales
citation: Civil Procedure Rules; Form N245 (Application to suspend a warrant of control / vary an instalment order)
---

# Form N245 - Varying a County Court Judgment (CCJ)

Once a creditor has obtained a County Court Judgment (CCJ) and either the
original instalment order is unaffordable, or a warrant of control (bailiff
enforcement of the CCJ itself) has been issued, the debtor can apply to the
court using Form N245 to vary the instalments to an affordable amount or
suspend the warrant, based on a statement of means (structurally identical
to a Standard Financial Statement).

## Key points

- **This is a formal court application, not a letter** - it must be filed
  with the court (with the applicable fee, or fee remission if eligible)
  and served on the creditor; the court, not the creditor, ultimately
  decides the varied amount if contested.
- **Statement of means**: the SFS-style income/outgoings breakdown produced
  by Breathing Room's calculator is exactly the evidence base an N245
  application needs - the same NDI/surplus figures used to compute the
  pro-rata offer to the creditor can be reused as the proposed instalment
  amount on the form.
- **Litigant in person boundary**: drafting the content of an N245
  application and its accompanying statement of means for the user to
  review and file themselves is informational/drafting assistance; actually
  filing it, appearing at a hearing, or negotiating with the court as the
  user's representative would cross into reserved legal activity under the
  Legal Services Act 2007 and must not be done by the app.

## How Breathing Room uses this

Whenever a creditor in the SFS calculation is flagged `is_ccj = true` (see
`app/sfs_engine/models.py`), the app generates a pre-filled N245 draft and
statement of means using that creditor's calculated strict pro-rata share as
the proposed new instalment, for the user to file themselves.
