#!/usr/bin/env bash
# Prefer the branded host. Legacy mcp.parthkadam.tech stays for old clients.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec bash "$ROOT/enable-mcp-applicable.sh"
