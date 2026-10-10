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

## Kayah — quick, ~10 min

- [ ] Faucet: paste `0x8960b2bbb4d1c1d9c20B23835680465Ad98F95AF` at
      faucet.monad.xyz, solve the CAPTCHA, request MON.
- [ ] Discord: hackathon.monad.xyz/dashboard → "Join the server".
- [ ] Privy: dashboard.privy.io → sign up → create an app → copy the App ID
      into `frontend/.env.local`.
- [ ] Once funded, deploy the contract:
      `cd contracts && forge script script/DeployDebtPots.s.sol:DeployDebtPots --rpc-url monad_testnet --broadcast --private-key $PRIVATE_KEY`

## Secondary engineer

- [ ] Wire the 3 frontend screens to the backend (`/calculate-sfs`,
      `/draft-appeal` are live and tested — no backend work needed there).
- [ ] OCR/vision for the camera-scan step (currently a stub).
- [ ] Register the Chainlink Automation upkeep at automation.chain.link
      once `DebtPots.sol` is deployed.
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

- [ ] Consent gate in front of `/draft-appeal`'s disability/health fields —
      not implemented yet, matters more than any UI polish.
- [ ] Full read-through of `docs/regulatory_guardrails.md` — check nothing
      built since has drifted into "debt adjusting" territory.
