# CRE migration: progress handoff (2026-10-07)

Full approved plan: ~/.claude/plans/mellow-riding-pizza.md
Old session log: ~/.claude/projects/-Users-sskmusic/1e858211-4ab0-4288-881c-08dbbcfdf2de.jsonl
(that session is dead: its request grew to ~8MB / 681k tokens and the API now rejects it with "not valid JSON")

## Done
- [x] Step 1: CRE CLI v1.37.0 installed at ~/.cre/bin/cre (`cre version` works; it's NOT at ~/.cre/cre)

## Done (2026-10-07, session b831ddd0)
- [x] Step 2: Kayah signed up at app.chain.link (org_s1oIvCQH6TfloEsO, "My Org"), 2FA on
- [x] Step 3: `cre login` done (whoami OK). Login prints a harmless "empty chain selector" error, ignore it
- [x] Step 4: scaffolded at automation-cre/breathing-room-automation/ (workflow dir: debtpots-sweep-check/)
      template 54/54 forge tests pass
- [x] Step 5: AutomationReceiver deployed: 0x95f9aA834e0e9B9930B3a6ebE63053143BE2245f
      tx 0x4f97fdaee11eae5900a6c07049b2854961be2622c66736d7ea6820b95cedd66b (forwarder verified on-chain)
- [x] Step 6: setCallAllowed(DebtPotsAutomation, 0x4585e33b, true), isCallAllowed = true
      tx 0xc2e07859048ed4595676cfd46eb6ef98eaeb6eebef8603ad257aa7b40c41ca05
- [x] Step 7: configs point at chain `monad-testnet`, cron every 2 min, workflow names debtpots-sweep-test / debtpots-sweep
- [x] Step 8: `cre workflow simulate debtpots-sweep-check --target=test-settings --non-interactive --trigger-index 0`
      -> read live checkUpkeep on Monad, "No upkeep needed" (pot empty, expected)

## Next
- [x] Deploy access REQUESTED 2026-10-07 10:47 via `cre account access` ("Access request submitted successfully"). Waiting on Chainlink email approval
- [ ] Step 9: `cre workflow deploy debtpots-sweep-check --target=production-settings` (needs CRE_ETH_PRIVATE_KEY in automation-cre/breathing-room-automation/.env; workflow owner = that key's address)
- [ ] REQUIRED before reports are accepted: set receiver identity, else every report reverts WorkflowIdentityNotConfigured.
      Option B: setExpectedAuthor(<workflow owner addr>) + setExpectedWorkflowName("debtpots-sweep"), or Option A: setExpectedWorkflowId(<id from cre workflow info>)
- [ ] Step 10: e2e proof (deposit via /sweep screen, watch CRE fire sweep() within ~2 min, confirm on testnet.monadscan.com)
- [ ] Step 11: update TODO.md + pitch doc (deprecation story beat)

## Key values
- Monad testnet CRE forwarder: 0xF8344CFd5c43616a4366C34E3EEE75af79a74482
- DebtPotsAutomation: 0x53CaD1B6B8d00d4dCDB118710B585821212062c7
- performUpkeep(bytes) selector: 0x4585e33b (verify with `cast sig`)

## Demo hosting (set up 2026-10-07, pre-UX raw build for team testing)
- Frontend: https://breathing-room-peach.vercel.app (Vercel project `breathing-room`, kayahs-projects; deploy from frontend/ with `vercel deploy --prod`, NEXT_PUBLIC_* passed as build env)
- Backend: https://breathing-api.178-62-45-130.sslip.io (Moltesha droplet 178.62.45.130, /srv/breathing-room-backend, docker container `breathing-room-backend` on 127.0.0.1:8095, nginx + certbot, mem_limit 600m)
  - redeploy: rsync backend/ (minus .venv, data/chroma, .env) then `docker compose build && docker compose up -d`
  - CORS via ALLOWED_ORIGINS in the droplet's .env; no MOONSHOT_API_KEY there, so /draft-appeal uses the deterministic template
- Privy: first real login on the Vercel domain is untested; if it errors, add the domain under Allowed origins in dashboard.privy.io
- "Invisible crypto" pass (2026-10-07): email-only Privy login, no wallet popups (showWalletUIs false), £ balances, no addresses, plain wording, Privy dev panel removed from home, app title fixed
- DebtPots is single-debtor (owner = Kayah's Privy wallet 0x6109...). Any other tester gets their OWN DebtPots deployed from their wallet on first /sweep visit (address kept in localStorage); the owner keeps using the main pot (the CRE-automated one)
- Demo faucet 0x07f2252dC50cD68c1c010989F0fDb1af4365e39b (key in frontend/.env.faucet, gitignored; Vercel env DEMO_FAUCET_PRIVATE_KEY), funded 2 MON. /api/demo-top-up sends 0.3 MON to wallets under 0.25. Demo creditors are paid to the faucet so payouts recycle. ~0.19 MON gas per tester pot deploy, so ~6 testers per 2 MON before it needs refilling
- Demo rate lowered to £1 = 0.00001 MON (was 0.001): re-set the main pot's allowance before the CRE e2e proof
