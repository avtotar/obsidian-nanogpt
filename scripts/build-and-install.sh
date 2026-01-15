#!/usr/bin/env bash
set -euo pipefail

VAULT_PATH=${1:-"/Users/0xgingi/Documents/Obsidian Vault"}
PLUGIN_ID="obsidian-nanogpt"

if [[ ! -d "${VAULT_PATH}" ]]; then
  echo "Vault path does not exist: ${VAULT_PATH}"
  exit 1
fi

PLUGIN_DIR="${VAULT_PATH}/.obsidian/plugins/${PLUGIN_ID}"

npm run build

mkdir -p "${PLUGIN_DIR}"

cp "main.js" "${PLUGIN_DIR}/main.js"
cp "manifest.json" "${PLUGIN_DIR}/manifest.json"
if [[ -f "styles.css" ]]; then
  cp "styles.css" "${PLUGIN_DIR}/styles.css"
fi

echo "Installed ${PLUGIN_ID} to ${PLUGIN_DIR}"
