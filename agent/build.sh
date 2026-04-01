#!/usr/bin/env bash
set -euo pipefail
VERSION=$(python -c "from locus_agent import __version__; print(__version__)")
PLATFORM=${1:-linux-x64}
shiv \
  --python '/usr/bin/env python3' \
  -e 'locus_agent.__main__:main' \
  -o "dist/locus-agent-${PLATFORM}.pyz" \
  --build-id "v${VERSION}" \
  --compressed \
  -r requirements.txt \
  .
echo "Built dist/locus-agent-${PLATFORM}.pyz (v${VERSION})"
