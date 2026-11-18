#!/usr/bin/env bash
# ADX-System fork: rebuild the docsite with the current adxs-ui and restart the site.
# The site is served at /adxs-ui on the same origin as DIP (gateway :8119, tailnet :8457).
#   bash scripts/adxs-site-update.sh            # adxs-ui changed (components, docs, CSS)
#   bash scripts/adxs-site-update.sh --full     # also rebuild the astryx packages (after pulling upstream)
set -euo pipefail
export PATH="$HOME/opt/node-v24.22.1-linux-x64/bin:$PATH"
export NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH-/adxs-ui}"   # empty = served at the root
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UI="${ADXS_UI:-$HOME/workspace/adxs-ui/react}"

(cd "$UI" && npm run -s build:integration-css)                # our component CSS (no page-wide rules)
python3 "$UI/../scripts/check_integration_css.py"               # it must not change astryx's look
cd "$ROOT"
if [[ "${1:-}" == "--full" ]]; then pnpm install && pnpm build; fi
node scripts/sync-adxs-ui.mjs "$UI"                             # snapshot -> packages/adxs-ui
pnpm install --no-frozen-lockfile >/dev/null
# our components add ShadCN registry routes; on this fork refreshing the reviewed lock is expected
rm -f apps/docsite/tsconfig.tsbuildinfo                          # a failed build leaves a stale type cache that fails the next build
(cd apps/docsite && UPDATE_SHADCN_ROUTE_LOCK=1 pnpm build)      # pages are generated at build time
systemctl --user restart adxs-ui-site.service
for i in $(seq 1 60); do curl -sf -o /dev/null "http://127.0.0.1:8118${NEXT_PUBLIC_BASE_PATH}/" && { echo "site up (${NEXT_PUBLIC_BASE_PATH:-/})"; exit 0; }; sleep 1; done
echo "site did not come up — journalctl --user -u adxs-ui-site" >&2; exit 1
