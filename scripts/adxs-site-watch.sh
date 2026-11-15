#!/usr/bin/env bash
# ADX-System fork: keep the docsite (tailnet :8458) in step with the merged code and the UI ledger.
# Runs from systemd timer adxs-site-watch.timer. The site builds from its own checkouts under ~/opt/adxs-site, never from
# a working copy someone is editing:
#   ~/opt/adxs-site/astryx   = this fork at origin/main        ~/opt/adxs-site/adxs-ui = ADX-System/adxs-ui at origin/v1-react
# It rebuilds only when one of the three changed: fork main, adxs-ui v1-react, the ledger export.
set -euo pipefail
export PATH="$HOME/opt/node-v24.22.1-linux-x64/bin:$HOME/.local/bin:$PATH"
SITE="$HOME/opt/adxs-site"; FORK="$SITE/astryx"; UI="$SITE/adxs-ui"
STATE="$HOME/.local/state/adxs-site"; mkdir -p "$STATE"
LEDGER="${UI_LEDGER_URL:-http://127.0.0.1:8126}"

git -C "$FORK" fetch -q origin main
git -C "$UI" fetch -q origin v1-react
fork_new=$(git -C "$FORK" rev-parse origin/main); ui_new=$(git -C "$UI" rev-parse origin/v1-react)
ledger_new=$(curl -sf "$LEDGER/export" | sha256sum | cut -c1-16)
key="$fork_new $ui_new $ledger_new"
[[ -f "$STATE/last" && "$(cat "$STATE/last")" == "$key" ]] && exit 0

echo "$(date -Is) change: fork ${fork_new:0:8} · adxs-ui ${ui_new:0:8} · ledger $ledger_new"
fork_old=$(git -C "$FORK" rev-parse HEAD); ui_old=$(git -C "$UI" rev-parse HEAD)
git -C "$FORK" checkout -q --detach "$fork_new"
git -C "$UI" checkout -q --detach "$ui_new"
if [[ "$ui_old" != "$ui_new" ]] && ! git -C "$UI" diff --quiet "$ui_old" "$ui_new" -- react/package-lock.json; then (cd "$UI/react" && npm ci --silent); fi
full=""
if [[ "$fork_old" != "$fork_new" ]] && ! git -C "$FORK" diff --quiet "$fork_old" "$fork_new" -- pnpm-lock.yaml packages; then full="--full"; fi
ADXS_UI="$UI/react" bash "$FORK/scripts/adxs-site-update.sh" $full
echo "$key" > "$STATE/last"
