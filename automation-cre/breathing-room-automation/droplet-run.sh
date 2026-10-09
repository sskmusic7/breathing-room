#!/bin/bash
# Breathing Room: Chainlink CRE workflow in the CLI simulator with live
# --broadcast (writes through Chainlink MockKeystoneForwarder on Monad
# testnet), while CRE deploy access is pending. Run every 2 min by
# /etc/cron.d/breathing-room-cre. Remove that file once the workflow is
# deployed to the Chainlink network.
LOG=/var/log/breathing-room-cre.log
cd /srv/breathing-room-cre || exit 1
# keep the log small
[ -f "$LOG" ] && [ "$(stat -c%s "$LOG")" -gt 2000000 ] && tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
{
  echo "=== $(date -u +%FT%TZ)"
  /root/.cre/bin/cre workflow simulate debtpots-sweep-check \
    --target=test-settings --non-interactive --trigger-index 0 --broadcast \
    --wasm /srv/breathing-room-cre/debtpots-sweep-check.wasm 2>&1 | grep -E "USER LOG|✗|rror"
} >> "$LOG" 2>&1
