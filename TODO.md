# Next steps

## Already done

- ~~Build `DebtPots.sol` payday-sweep contract (9/9 tests)~~
- ~~Build the deterministic SFS calculator (5/5 tests)~~
- ~~Build the local legal RAG - 11 UK statute summaries (Chroma, offline)~~
- ~~Clone the official Monad/Privy frontend starter, `npm install`~~
- ~~Push everything to `github.com/sskmusic7/breathing-room`~~
- ~~Fill in the hackathon dashboard project description + repo link~~
- ~~Connect Chainlink Automation - `DebtPotsAutomation.sol` (9/9 tests)~~
- ~~Connect Alchemy - RPC alias + Notify webhook receiver (8/8 tests)~~
- ~~Add Pauline (`112358132135`) as a repo collaborator, write access~~
- ~~Faucet, Discord, Privy app ID, deploy `DebtPots.sol` to
  `0x40f91DAdb62d2186669CA1F4388A782240d9c111`~~
- ~~Wire the 3 frontend screens (`/sfs`, `/appeal`, `/sweep`) to the backend,
  including the GDPR consent gate for mitigating circumstances~~
- ~~Deploy `DebtPotsAutomation.sol` at
  `0x53CaD1B6B8d00d4dCDB118710B585821212062c7`, watching the DebtPots above~~
- ~~Transfer `DebtPots` ownership to the Privy embedded wallet
  (`0x6109101c40fd714C0B5bb32F71A73AD520Ed2932`) and verify the full
  forward funds → set allowance → set creditors → sweep flow on-chain~~

## Secondary engineer

- [ ] OCR/vision for the camera-scan step (currently manual entry in
      `/appeal`, honestly labeled as "coming soon").
- [ ] Automate `DebtPotsAutomation` (`0x53CaD1B6B8d00d4dCDB118710B585821212062c7`)
      via Chainlink CRE. Classic Automation testnet registration was deprecated
      (24 Jun 2026), so we migrated with Chainlink's bridge template in
      `automation-cre/`. AutomationReceiver deployed + allowlisted at
      `0x95f9aA834e0e9B9930B3a6ebE63053143BE2245f`, simulation passes against
      live Monad state. Waiting on CRE deploy access (requested 7 Oct), then
      deploy + set receiver identity + e2e sweep proof.
      Full status: `docs/CRE_MIGRATION_PROGRESS.md`.
- [ ] Set up the Alchemy app + Notify webhook at dashboard.alchemy.com.
- [ ] TrueLayer/Yapily Open Banking sandbox (replaces manually-entered SFS
      figures).

## UI/UX

- [ ] Design 4 screens: camera scan, SFS budget dashboard, appeal
      review-and-sign, payday-sweep confirmation.
- [ ] Design the vulnerability/consent screen — standalone consent toggle,
      non-judgmental copy (see `docs/data_protection.md`).
- [ ] Replace placeholder PWA icons/splash screens.

## PM

- [ ] Apply for SFS Membership number (MaPS) — free.
- [ ] Register as Data Controller with the ICO (~£40/year).
- [ ] Decide whether Chainlink/Alchemy stay in the bounty selections (now
      genuinely built) or get dropped — check the Tracks & Bounties page
      for anything else selected with nothing built against it.
- [ ] Own the Oct 14 04:59 GMT+1 deadline: demo video, deck, Submission tab,
      final "Review and Submit".

## Before submitting (whoever's last)

- ~~Consent gate in front of `/draft-appeal`'s disability/health fields~~ —
      built 2026-10-05, verified the fields stay hidden until consent is ticked.
- [ ] Full read-through of `docs/regulatory_guardrails.md` — check nothing
      built since has drifted into "debt adjusting" territory.
