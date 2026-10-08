# Draft mentor questions

Requires 3 progress updates posted first. Edit before sending — these are drafts.

---

## To Antons K. (Co-Founder & COO, Crouton Digital — EU/UK Payments Licenses)

**Compliance/legality:**
Breathing Room is a non-custodial UK debt-management assistant (Solidity +
Standard Financial Statement engine). We've deliberately scoped it to stay out
of FCA "debt adjusting" territory (no negotiating with creditors on the user's
behalf, self-help SFS tooling only) and out of reserved legal activities
(letters are drafts the user sends themselves). Given you know EU/UK payments
licensing: does a non-custodial smart contract that *automatically* forwards a
user's own pre-authorized payment to their creditors cross into needing an
e-money/payment-institution license, even though it never holds funds outside
a single sweep transaction? Is there a known safe pattern for "automated but
user-authorized" payment flows we should be modeling this on?

---

## To Robert Chang (Ecosystem, Monad Foundation) or Kenny Zhang (Crypto GTM Lead, Privy)

**Deliverability / beyond the hackathon / track fit:**
We're building for the Consumer Products & Payments track, where Founder &
Market Readiness and Traction & Path Forward are 45% of judging combined. Our
actual target user (someone with UK parking fines/council debt) has never
touched crypto and never will knowingly — Monad and Privy are invisible
infrastructure to them. Two questions: (1) What's a credible "first 100 users"
distribution plan for a product like this, where the audience doesn't search
for "blockchain" solutions? (2) Realistically, what's missing from a hackathon
build like ours (non-custodial debt-sweep contract + SFS engine + legal RAG)
before it's something you'd call fundable or pilot-ready, versus still a demo?

---

## General / whoever's free — Chainlink mentor (Darp, Developer Relations Engineer)

**On the automation piece specifically:**
We've deployed a Chainlink Automation-compatible upkeep (`checkUpkeep`/
`performUpkeep`) that triggers a non-custodial payout contract the instant a
balance threshold is met, and we're about to register it on Monad testnet.
Is there anything Monad-testnet-specific about Automation registration we
should know before judging (quirks, delays, a recommended gas limit), and is
there a way to demo the registered upkeep actually firing live during judging
rather than just showing the registration screen?
