#!/usr/bin/env bash
# Smoke-test a deployed Applicable MCP endpoint.
# Usage: scripts/smoke.sh https://mcp.example.com
#        scripts/smoke.sh http://localhost
set -euo pipefail

BASE="${1:-}"
if [[ -z "${BASE}" ]]; then
  echo "Usage: $0 <base-url>" >&2
  echo "  e.g. $0 https://mcp.example.com" >&2
  echo "       $0 http://localhost" >&2
  exit 2
fi

BASE="${BASE%/}"
PASS=0
FAIL=0

# curl: follow redirects; allow insecure TLS for localhost / 127.0.0.1
# (Caddy issues an internal cert and HTTP→HTTPS redirects)
CURL=(curl -sS -L --max-time 30)
HOST_PART="${BASE#*://}"
HOST_PART="${HOST_PART%%/*}"
HOST_PART="${HOST_PART%%:*}"
if [[ "${HOST_PART}" == "localhost" || "${HOST_PART}" == "127.0.0.1" ]]; then
  CURL+=(-k)
fi

ok() { echo "PASS  $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL  $*"; FAIL=$((FAIL + 1)); }

extract_json() {
  # Prefer SSE "data:" lines; else whole body
  local body="$1"
  if grep -q '^data:' <<<"${body}"; then
    grep '^data:' <<<"${body}" | sed 's/^data:[[:space:]]*//' | tail -n 1
  else
    printf '%s' "${body}"
  fi
}

echo "== smoke against ${BASE} =="

# 1) /health
HEALTH="$("${CURL[@]}" "${BASE}/health" || true)"
if grep -q '"ok"[[:space:]]*:[[:space:]]*true' <<<"${HEALTH}"; then
  ok "/health → ${HEALTH}"
else
  bad "/health → ${HEALTH:-empty}"
fi

# 2) initialize
INIT_BODY='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.1"}}}'
INIT_RAW="$("${CURL[@]}" -X POST "${BASE}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d "${INIT_BODY}" || true)"
INIT_JSON="$(extract_json "${INIT_RAW}")"
if grep -q '"serverInfo"' <<<"${INIT_JSON}" && grep -q 'applicable' <<<"${INIT_JSON}"; then
  ok "initialize → applicable"
else
  bad "initialize → ${INIT_JSON:-empty}"
fi

# Capture session id if present (stateful servers)
SESSION=""
SESSION="$("${CURL[@]}" -D - -o /dev/null -X POST "${BASE}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d "${INIT_BODY}" 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="mcp-session-id"{print $2; exit}' || true)"
SESSION_HDR=()
if [[ -n "${SESSION}" ]]; then
  SESSION_HDR=(-H "Mcp-Session-Id: ${SESSION}")
  echo "      (session ${SESSION})"
fi

# 3) tools/list
LIST_BODY='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
LIST_RAW="$("${CURL[@]}" -X POST "${BASE}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  "${SESSION_HDR[@]}" \
  -d "${LIST_BODY}" || true)"
LIST_JSON="$(extract_json "${LIST_RAW}")"
if grep -q 'search_jobs' <<<"${LIST_JSON}" && grep -q '"stats"' <<<"${LIST_JSON}"; then
  ok "tools/list → search_jobs + stats present"
else
  bad "tools/list → ${LIST_JSON:0:400}"
fi

# 4) tools/call stats
STATS_BODY='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"stats","arguments":{}}}'
STATS_RAW="$("${CURL[@]}" -X POST "${BASE}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  "${SESSION_HDR[@]}" \
  -d "${STATS_BODY}" || true)"
STATS_JSON="$(extract_json "${STATS_RAW}")"
if grep -qE 'companies_active|tech_open_jobs|by_eligibility' <<<"${STATS_JSON}"; then
  ok "tools/call stats → ok"
  echo "      $(printf '%s' "${STATS_JSON}" | head -c 280)"
else
  bad "tools/call stats → ${STATS_JSON:0:400}"
fi

echo
echo "Result: ${PASS} passed, ${FAIL} failed"
if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
exit 0
