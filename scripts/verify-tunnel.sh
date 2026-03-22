#!/usr/bin/env bash
# verify-tunnel.sh — Test of de OB1 stack bereikbaar is via Cloudflare Tunnel
#
# Gebruik:
#   ./scripts/verify-tunnel.sh https://ob1.jouwnaam.com
#   ./scripts/verify-tunnel.sh http://localhost:3000       (lokaal testen)

set -euo pipefail

BASE_URL="${1:-}"
if [[ -z "$BASE_URL" ]]; then
  echo "Gebruik: $0 <base-url>"
  echo "  bijv.: $0 https://ob1.jouwnaam.com"
  echo "  bijv.: $0 http://localhost:3000"
  exit 1
fi

# Trim trailing slash
BASE_URL="${BASE_URL%/}"

PASS=0
FAIL=0

check() {
  local label="$1"
  local expected_status="$2"
  local url="$3"
  shift 3
  local extra_args=("$@")

  local actual_status
  actual_status=$(curl -s -o /dev/null -w "%{http_code}" "${extra_args[@]}" "$url" 2>/dev/null || echo "000")

  if [[ "$actual_status" == "$expected_status" ]]; then
    echo "  ✓ $label (HTTP $actual_status)"
    ((PASS++)) || true
  else
    echo "  ✗ $label — verwacht HTTP $expected_status, kreeg $actual_status"
    ((FAIL++)) || true
  fi
}

echo ""
echo "OB1 Tunnel Verificatie"
echo "URL: $BASE_URL"
echo "────────────────────────────────────────"

echo ""
echo "[ Publieke endpoints (geen auth) ]"
check "GET /health" "200" "$BASE_URL/health"
check "GET /api/info" "200" "$BASE_URL/api/info"

echo ""
echo "[ Beveiligde endpoints — zonder key (moet 401 geven) ]"
check "GET /api/thoughts (geen key)" "401" "$BASE_URL/api/thoughts"
check "GET /mcp (geen key)" "401" "$BASE_URL/mcp"

if [[ -n "${OB1_ACCESS_KEY:-}" ]]; then
  echo ""
  echo "[ Beveiligde endpoints — met OB1_ACCESS_KEY ]"
  check "GET /api/thoughts (met key)" "200" "$BASE_URL/api/thoughts" -H "x-brain-key: $OB1_ACCESS_KEY"
  check "GET /api/tasks (met key)"    "200" "$BASE_URL/api/tasks"    -H "x-brain-key: $OB1_ACCESS_KEY"
  check "GET /api/notes (met key)"    "200" "$BASE_URL/api/notes"    -H "x-brain-key: $OB1_ACCESS_KEY"
else
  echo ""
  echo "[ Overgeslagen: OB1_ACCESS_KEY niet ingesteld ]"
  echo "  Stel de env var in voor volledige verificatie:"
  echo "  export OB1_ACCESS_KEY='jouw_sleutel'"
fi

echo ""
echo "────────────────────────────────────────"
echo "Resultaat: $PASS geslaagd, $FAIL mislukt"
echo ""

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
