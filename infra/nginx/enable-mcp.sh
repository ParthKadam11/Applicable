#!/usr/bin/env bash
# Canonical MCP host: mcp.applicable.click
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec bash "$ROOT/enable-mcp-applicable.sh"
