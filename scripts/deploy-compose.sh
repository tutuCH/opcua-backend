#!/usr/bin/env bash
set -euo pipefail

echo "This script is deprecated. Use scripts/deploy.sh instead."
exec "$(cd "$(dirname "$0")" && pwd)/deploy.sh" "$@"


