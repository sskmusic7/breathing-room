# Draft progress updates for the Metropolis dashboard

Paste these into the "Post a progress update" flow, in order. Edit freely — these are drafts, not final copy.

---

## Update 1: Non-custodial payday-sweep engine, live on testnet

Shipped `DebtPots.sol` — a non-custodial Solidity contract that ring-fences a debtor's
living-cost allowance and savings buffer, then streams the surplus pro-rata to their
creditors the moment a payday deposit lands. Paired with a deterministic SFS
(Standard Financial Statement) calculator and a legal-RAG engine that drafts UK
PCN/parking-notice representations grounded in 11 real statute/code-of-practice
sources (Chroma, fully offline, no API cost). 9/9 and 5/5 unit tests passing.
Live on Monad testnet: `0x40f91DAdb62d2186669CA1F4388A782240d9c111`.

## Update 2: Three real screens, wired end to end — not a mockup

Built the actual product UI: an SFS budget calculator, a notice-drafting flow with
a GDPR Article-9 consent gate (health/neurodivergence fields are genuinely hidden
until explicit consent, not just disabled), and a payday-sweep screen where the
user's own Privy embedded wallet signs the on-chain transactions. Verified for
real on testnet today — not simulated: forwarded funds into the pot, set the
allowance, set the creditor table, and triggered a sweep, with the debtor's
ring-fenced allowance and the creditor's payout both landing correctly on-chain.

## Update 3: Chainlink Automation wired in — no one has to click "sweep"

Deployed `DebtPotsAutomation.sol` (`0x53CaD1B6B8d00d4dCDB118710B585821212062c7`),
a Chainlink Automation-compatible upkeep that watches a DebtPots contract and
calls `sweep()` itself the instant a payday deposit covers the ring-fenced
allowance — no backend cron job, no one needing to be online. Combined with the
existing Alchemy Notify webhook (detects the deposit for user-facing push
notifications) and the Privy-signed UI flow, the full loop — detect payday,
notify the user, sweep automatically — is now live end to end on Monad testnet.
