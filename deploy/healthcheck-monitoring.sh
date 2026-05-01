#!/usr/bin/env bash
# Optional cron: */5 * * * * /path/to/machakos/deploy/healthcheck-monitoring.sh
set -euo pipefail
BASE="${MACHAKOS_PUBLIC_URL:-https://monitoring.icskenya.co.ke}"
code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 25 "$BASE/" || echo "000")
if [[ "$code" != "200" && "$code" != "304" ]]; then
  echo "$(date -Is) FAIL $BASE/ HTTP $code" >&2
  exit 1
fi
echo "$(date -Is) OK $BASE/ HTTP $code"
