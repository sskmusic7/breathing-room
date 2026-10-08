#!/bin/zsh
# Interim automation while CRE deploy access is pending: runs the real CRE
# workflow in the CLI simulator with --broadcast, which writes through
# Chainlink's MockKeystoneForwarder on Monad testnet.
# The WASM is prebuilt on Linux (local javy segfaults on this Mac): see
# docs/CRE_MIGRATION_PROGRESS.md. Usage: ./run-sweep-check.sh [--loop]
cd "$(dirname "$0")"
run_once() {
  echo "=== $(date -u +%FT%TZ)"
  "$HOME/.cre/bin/cre" workflow simulate debtpots-sweep-check \
    --target=test-settings --non-interactive --trigger-index 0 --broadcast \
    --wasm "$PWD/debtpots-sweep-check.wasm" 2>&1 | grep -E "USER LOG|✗|rror"
}
if [[ "$1" == "--loop" ]]; then
  while true; do run_once; sleep 120; done
else
  run_once
fi
