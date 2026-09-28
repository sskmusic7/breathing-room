# Next steps

## You (Kayah) — quick, ~10 min

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
