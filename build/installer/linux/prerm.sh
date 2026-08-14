#!/bin/sh
set -euo pipefail

echo "Testrix deb pre-remove hook: stopping running sessions can be scripted here."
if [ "${TESTRIX_KEEP_CONFIG:-0}" = "1" ]; then
  echo "TESTRIX_KEEP_CONFIG=1 set — leaving user data on disk."
fi
exit 0
