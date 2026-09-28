# Breathing Room

**Debts managed, on autopilot.**

A UK debt & Penalty Charge Notice (PCN) management assistant: an AI/RAG
engine that helps people understand their rights, draft formal
representations, and negotiate a means-tested payment plan (built on the
same Standard Financial Statement logic National Debtline/Business Debtline
use) - with a non-custodial Monad smart contract that automatically
ring-fences essential living costs and streams whatever's left, pro-rata,
to creditors on payday.

Built for the **Metropolis (Monad) hackathon** - deadline **14 Oct, 04:59
GMT+1**.

- **Primary track**: Consumer Products & Payments ($30,000)
- **Sponsor bounties targeted**: Privy! ($5,000 - embedded wallet doing more
  than login, signing the payday sweep), Best Builds Powered by KIMI
  ($3,000 in credits - powers the legal-appeal drafting pipeline), Best
  workflow with CRE ($3,000 - Chainlink Automation triggers the payday
  sweep on-chain), and Best Projects using Alchemy ($1,000 in credits -
  RPC + Notify webhooks for push notifications)

## Repo layout

```
breathing-room/
├── contracts/     Foundry project - DebtPots.sol, deployed to Monad testnet
├── backend/       FastAPI - deterministic SFS engine + local legal RAG
├── frontend/      Next.js PWA (cloned from the official Monad/Privy
│                  embedded-wallet starter template) - UI not yet wired to
│                  the backend, see "What's still needed" below
└── docs/          Regulatory guardrails, data protection notes
```

## What's actually built and tested right now

- **`contracts/src/DebtPots.sol`** - the payday-sweep router. Ring-fences
  living costs + savings buffer back to the debtor, pays priority creditors'
  fixed token offers, then streams the remaining surplus pro-rata to
  non-priority creditors. Non-custodial (`Ownable(debtor)`), reentrancy-
  guarded, and a single failing/blocked creditor address can never freeze
  everyone else's payout (best-effort payout with a `PaymentFailed` event
  instead of a revert). **9/9 tests passing**, including a live reentrancy
  attack simulation and the exact pro-rata numbers from the blueprint's own
  worked example (Aqua/NewDay CCJ at 59.1% -> GBP3.68/month, etc).

  ```bash
  cd contracts && forge test -vv
  ```

- **`contracts/src/DebtPotsAutomation.sol`** - the actual "autopilot": a
  Chainlink Automation-compatible wrapper (`checkUpkeep`/`performUpkeep`)
  that calls `DebtPots.sweep()` the moment a payday deposit lands, on-chain,
  with no backend or cron job needing to be trusted or even online.
  `DebtPots.sol` itself is untouched (`sweep()` was already open to any
  caller, so Automation just becomes another valid caller). **9/9 tests
  passing**, including re-validating on-chain state rather than trusting
  the registry's `performData` (per Chainlink's own guidance) and proving
  any address can call `performUpkeep` (matches how the Automation registry
  actually calls it, from an unpredictable forwarder address).

  ```bash
  cd contracts && forge test --match-path test/DebtPotsAutomation.t.sol -vv
  ```

  To actually register it: deploy `DebtPots.sol`, then
  `script/DeployDebtPotsAutomation.s.sol` with `DEBT_POTS_ADDRESS` set, then
  register the deployed `DebtPotsAutomation` address as a Custom Logic
  upkeep at [automation.chain.link](https://automation.chain.link) (Monad
  testnet), funded with testnet LINK.

- **`backend/app/webhooks/alchemy.py`** - Alchemy Notify webhook receiver.
  Verifies the `X-Alchemy-Signature` HMAC-SHA256 header exactly per
  Alchemy's docs, parses an Address Activity payload, and turns an incoming
  transfer into a `PaydayDepositEvent` - purely a notification path ("tell
  the user something happened"), deliberately kept independent from the
  Chainlink Automation trigger above ("make the payment happen"), so
  neither depends on the other being online. **8/8 tests passing**,
  including signature-tampering rejection and the missing-config 503 path.
  Actual push delivery isn't wired up yet - see the docstring on
  `notify_payday_deposit()` for exactly why (it needs the frontend's
  push-subscription storage, which the Privy PWA starter leaves as a TODO).

  ```bash
  cd backend && source .venv/bin/activate && python -m pytest tests/test_alchemy_webhook.py -v
  ```

- **`backend/app/sfs_engine/`** - the deterministic Standard Financial
  Statement calculator. No LLM anywhere near the money maths - pure,
  auditable Decimal arithmetic. **5/5 tests passing**, reproducing the
  blueprint's exact worked example (£479.21 income, £467.98 outgoings,
  £6.23 surplus, down to the penny on every creditor's allocation).

  ```bash
  cd backend && source .venv/bin/activate && python -m pytest tests/ -v
  ```

- **`backend/app/rag/`** - local, in-house legal RAG. 11 UK statute/
  regulation summaries (`backend/data/legal_corpus/*.md`) covering traffic
  & parking enforcement, disability/equality duties, and debt enforcement,
  ingested into a local Chroma vector store (fully offline after the first
  embedding-model download - **not** GCP Vertex AI, since this account's GCP
  billing is currently off; swapping in a hosted embedding/LLM provider
  later is a one-line change, not a rewrite). `/draft-appeal` retrieves the
  relevant statutes and drafts a representation letter grounded in them,
  using **KIMI (Moonshot AI)** when `MOONSHOT_API_KEY` is set, or a
  deterministic template fallback (fully demoable with zero API keys).

  ```bash
  cd backend && source .venv/bin/activate
  python -m app.rag.ingest          # one-time: ingest the legal corpus
  uvicorn app.main:app --reload --port 8420
  ```

- **`frontend/`** - the official Monad `next-serwist-privy-embedded-wallet`
  PWA starter, cloned as-is (`npm install` run, builds). Privy gives
  passkey/email login with a hidden embedded wallet - exactly what the
  Consumer Products track and the Privy bounty want (crypto invisible to
  the end user). **UI screens (camera scan, SFS dashboard, appeal review)
  are not built yet** - that's real, opinionated UX work better done with
  you reviewing it than guessed overnight. See `frontend/README.md` for the
  template's own setup instructions.

## What's still needed (honest list, in priority order)

1. **A Privy account + `NEXT_PUBLIC_PRIVY_APP_ID`** - go to
   [dashboard.privy.io](https://dashboard.privy.io), create an app, drop the
   App ID into `frontend/.env.local` (copy from `.env.example`).
2. **Frontend screens**: camera/upload -> `/draft-appeal`, an SFS
   input form -> `/calculate-sfs`, and a "payday sweep" screen that builds
   the `DebtPots.setCreditors()` / `sweep()` transactions via the Privy
   embedded wallet (contract ABI is in `contracts/out/DebtPots.sol/` after
   `forge build`).
3. **Consent gate + redaction** before any real user's disability/health
   disclosure or debt data touches `/draft-appeal` - see
   `docs/data_protection.md`, this is not implemented yet and matters more
   than any UI polish.
4. **Deploy `DebtPots.sol` to Monad testnet** (needs a funded testnet
   wallet - see faucet link below):
   ```bash
   cd contracts
   forge script script/DeployDebtPots.s.sol:DeployDebtPots \
     --rpc-url monad_testnet --broadcast --private-key $PRIVATE_KEY
   ```
5. **OCR/vision step** for the camera-scan flow (`app/openbanking/` and the
   vision extraction step are empty stubs right now - the RAG/drafting
   pipeline expects already-structured `NoticeFacts`, see
   `backend/app/rag/draft.py`).
6. **Real Open Banking sandbox** (TrueLayer/Yapily) instead of manually-
   entered SFS figures.
7. **SFS Membership number** (MaPS) + **ICO registration** - see
   `docs/regulatory_guardrails.md` and `docs/data_protection.md` for exactly
   why and how.
8. **Register the Chainlink Automation upkeep** and **create the Alchemy
   app + Notify webhook** (both need real dashboard accounts - see "Useful
   hackathon links" below) once `DebtPots.sol` is deployed to testnet.

## Useful hackathon links

- Dashboard: https://hackathon.monad.xyz/dashboard
- Testnet faucet: https://faucet.monad.xyz
- Monad testnet: chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`,
  explorer https://testnet.monadscan.com
- Privy dashboard: https://dashboard.privy.io
- KIMI/Moonshot API: https://platform.moonshot.ai
- Chainlink Automation: https://automation.chain.link
- Alchemy dashboard (create a "Monad Testnet" app): https://dashboard.alchemy.com

---
Breathing Room provides legal information and software tools, not legal
advice. Users are responsible for reviewing and sending their own appeals.
