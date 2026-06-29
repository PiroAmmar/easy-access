#!/usr/bin/env bash
# Easy Access Agent — Linux/macOS Installation Script
# Usage: bash install-linux.sh

set -e

CONFIG_DIR="$HOME/.easy-access-agent"
CONFIG_FILE="$CONFIG_DIR/config.json"

echo ""
echo "=== Easy Access Agent Installer ==="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is required. Install from https://nodejs.org"
    exit 1
fi
echo "[OK] Node.js $(node --version) found"

# Interactive prompts
read -rp "Hub WebSocket URL (e.g. wss://myserver.com/ws): " HUB_URL
read -rp "Agent Token (from dashboard): " AGENT_TOKEN
read -rp "Allowed Directories (comma-separated, e.g. /home/user/data,/mnt/shared): " DIRS_INPUT

# Validate
if [ -z "$HUB_URL" ]; then echo "[ERROR] Hub URL is required"; exit 1; fi
if [ -z "$AGENT_TOKEN" ]; then echo "[ERROR] Agent Token is required"; exit 1; fi
if [ -z "$DIRS_INPUT" ]; then echo "[ERROR] At least one directory is required"; exit 1; fi

# Parse directories into JSON array
IFS=',' read -ra DIRS <<< "$DIRS_INPUT"
DIRS_JSON="["
for i in "${!DIRS[@]}"; do
    DIR=$(echo "${DIRS[$i]}" | xargs) # trim whitespace
    if [ "$i" -gt 0 ]; then DIRS_JSON+=","; fi
    DIRS_JSON+="\"$DIR\""
done
DIRS_JSON+="]"

# Create config directory
mkdir -p "$CONFIG_DIR"

# Write config
cat > "$CONFIG_FILE" << EOF
{
  "hubUrl": "$HUB_URL",
  "agentToken": "$AGENT_TOKEN",
  "allowedDirs": $DIRS_JSON
}
EOF

chmod 600 "$CONFIG_FILE"

echo ""
echo "[OK] Config saved to $CONFIG_FILE"
echo ""
echo "To start the agent:"
echo "  cd <easy-access-project>"
echo "  pnpm --filter @easy-access/agent dev"
echo ""
