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

## Interim automation (2026-10-08): CRE simulator with --broadcast, PROVEN
- Receiver forwarder switched to Chainlink's Monad MockKeystoneForwarder 0xB9F79d863261869B234c481D1f9A7af84AeAd192
- Receiver identity: setExpectedAuthor(0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa) (the simulator's placeholder owner) + setExpectedWorkflowName("debtpots-sweep-test")
- First automatic payout: tx 0x4c24331de971717dd6aff5de12c2fc15e0e171e9eb2c937a8d8f901506629f67 (0.32 MON in, 0.31 back to debtor, 0.01 to creditor, 220k gas)
- Run: automation-cre/breathing-room-automation/run-sweep-check.sh (once) or `--loop` (every 2 min). Gas paid by CRE_ETH_PRIVATE_KEY (deployer) in that folder's gitignored .env
- Local javy segfaults (exit 139) on this Intel Mac, so the WASM is compiled on the Moltesha droplet (/tmp/crep, `bun x cre-compile`) and passed with --wasm. Recompile there after any main.ts change
- Monad bills the full gas LIMIT, not gas used: keep writeGasLimit at 500000 (2M cost ~0.2 MON per run)
- WHEN DEPLOY ACCESS LANDS: setForwarderAddress back to 0xF8344CFd5c43616a4366C34E3EEE75af79a74482, setExpectedAuthor(<real workflow owner>) + setExpectedWorkflowName("debtpots-sweep"), stop the loop

## Open Banking auto-collection (2026-10-08), built, awaiting TrueLayer sandbox credentials
- Backend /bank/* (backend/app/openbanking/): connect bank (Data API, read-only) -> commercial VRP mandate capped at monthly surplus -> background check every 2 min spots payday -> collects ONLY the surplus -> on executed, simulated on-ramp sends GBP-equivalent MON into the user's pot -> Chainlink CRE pays creditors
- Droplet .env still needs: TRUELAYER_CLIENT_ID, TRUELAYER_CLIENT_SECRET, TRUELAYER_SIGNING_KEY_ID, TRUELAYER_MERCHANT_ACCOUNT_ID. Signing key: backend/secrets/ (gitignored), mounted at /app/secrets on the droplet. State: /srv/breathing-room-backend/state/bank.json
- Console redirect URIs: https://breathing-api.178-62-45-130.sslip.io/bank/callback (bank link) AND https://breathing-room-peach.vercel.app/sweep (mandate return)
- NOT yet run against real TrueLayer: mandate body shape (use_case / user_interaction placement) is from docs and may need a tweak on first call
- WARNING: this Mac corrupts large file writes (see memory). Build on Vercel/droplet only

## Interim automation moved to the droplet (2026-10-09)
- Runs on Moltesha every 2 min via /etc/cron.d/breathing-room-cre -> /srv/breathing-room-cre/run.sh (copy in automation-cre/breathing-room-automation/droplet-run.sh). Log: /var/log/breathing-room-cre.log (self-capped at 2MB). ~200MB RAM for ~5s per run
- CRE CLI v1.38.0 at /root/.cre/bin/cre, logged in by copying ~/.cre/cre.yaml + context.yaml from the Mac. If the login expires there, re-run `cre login` on the Mac and re-copy those two files
- The Mac loop (run-sweep-check.sh --loop) is no longer needed
- When deploy access lands: deploy to the Chainlink network, switch the receiver back to the production forwarder + real owner, then `rm /etc/cron.d/breathing-room-cre`

## GBP creditor payouts via Revolut (2026-10-12), LIVE in sandbox
- Revolut Business sandbox, Client ID p3wwcmZt…, cert backend/secrets/revolut_public.cer (private key gitignored, mounted on droplet), refresh token in /srv/breathing-room-backend/state/revolut.json
- First payout: £12.40 to "Lambeth Council" (04-00-04 / 12345678), ref PCN LB123456, tx 0568dfbf-… (pending is normal in sandbox)
- Revolut requires a postal address for UK business payees: collected on the confirm-creditors step
- Worker turns each on-chain CreditorPaid (to SETTLEMENT_ADDRESS = demo faucet) into one Revolut transfer; tx hash + log index = request_id (idempotent)
- KIMI: key on droplet, model kimi-k2.6, account needs a top-up (insufficient balance); appeals fall back to the template until then

## Pausable pot redeploy (2026-10-12, 22:10)
- Mentor (EU/UK payments licences) advised the user must be able to pause/change/cancel before payout. DebtPots now has debtor-only setPaused(bool); sweep reverts while paused; automation reports nothing due
- NEW main pot: 0x26618B97016Db6d384A11c4B5800D58d2c3cE2F6 (owner Kayah's Privy wallet 0x6109…2932, allowance 0/0 for bank mode)
- NEW automation: 0x1fA32e793a687Be43D16F15149720bDbd67b1b3f, allowlisted on the receiver; CRE config targetAddress updated (repo + droplet)
- Old pot 0x40f9…c111 / automation 0x53Ca…62c7 retired (empty)
- Testers get a fresh pausable pot automatically (localStorage key bumped to v2)
- Kayah must re-run "Confirm creditors" on the new pot in the app before the demo
- KIMI live: kimi-k2.6 needs temperature omitted (only 1 allowed), ~100s per letter (reasoning), backend timeout 150s, nginx 200s
