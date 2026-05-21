#!/usr/bin/env bash
set -euo pipefail

echo "Uninstall helper for locally dragged Testrix.app installations."
APP_PATH="${1:-/Applications/Testrix.app}"

if [ -d "$APP_PATH" ]; then
  echo "Removing $APP_PATH ..."
  rm -rf "$APP_PATH"
else
  echo "Skipping missing bundle at $APP_PATH"
fi

CONFIG_DIR="$HOME/Library/Application Support/Testrix"
if [ "${KEEP_TESTRIX_CONFIG:-1}" != "1" ]; then
  echo "Removing config under $CONFIG_DIR ..."
  rm -rf "$CONFIG_DIR"
else
  echo "KEEP_TESTRIX_CONFIG=1 — preserving $CONFIG_DIR"

fi
