#!/bin/zsh
# Mirrors the known-good deploy: source env files (comments stripped by the shell),
# then force the production API URL and demo creditor. usage: vdeploy.sh --prod
cd ~/BreathingRoom/frontend || exit 1
set -a; source .env.local; source .env.faucet; set +a
NEXT_PUBLIC_API_URL=https://breathing-api.178-62-45-130.sslip.io
NEXT_PUBLIC_DEMO_CREDITOR_ADDRESS=$DEMO_FAUCET_ADDRESS
ARGS=()
for k in NEXT_PUBLIC_PRIVY_APP_ID NEXT_PUBLIC_PRIVY_CLIENT_ID NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY NEXT_PUBLIC_API_URL NEXT_PUBLIC_DEBT_POTS_ADDRESS NEXT_PUBLIC_DEMO_CREDITOR_ADDRESS; do ARGS+=(--build-env "$k=${(P)k}" --env "$k=${(P)k}"); done
for k in WEB_PUSH_EMAIL WEB_PUSH_PRIVATE_KEY DEMO_FAUCET_PRIVATE_KEY; do ARGS+=(--env "$k=${(P)k}"); done
exec vercel deploy "$@" --yes --name breathing-room "${ARGS[@]}"
