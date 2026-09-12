#!/bin/bash
# Simulate GitHub webhook deliveries against LOCAL dev server (Block 03).
# Usage: bash simulate-webhook.sh issues_closed|pr_merged
# Requires: dev server on :3000, GITHUB_WEBHOOK_SECRET in frontend/.env
set -u
cd /home/anurag/flint/frontend || exit 1
SECRET=$(grep ^GITHUB_WEBHOOK_SECRET= .env | cut -d= -f2)
if [ -z "$SECRET" ]; then echo "set GITHUB_WEBHOOK_SECRET first"; exit 1; fi
MODE=${1:-issues_closed}
if [ "$MODE" = "issues_closed" ]; then
  EVENT=issues
  PAYLOAD='{"action":"closed","repository":{"full_name":"anurag-p6/crypto-fraud-attribution"},"installation":{"id":123},"issue":{"number":1,"state_reason":null,"labels":[{"name":"flint"}]}}'
elif [ "$MODE" = "pr_merged" ]; then
  EVENT=pull_request
  PAYLOAD='{"action":"closed","repository":{"full_name":"anurag-p6/crypto-fraud-attribution"},"installation":{"id":123},"pull_request":{"number":2,"merged":true,"body":"Implements milestone.\n\ncloses #1"}}'
else
  echo "unknown mode: $MODE"; exit 1
fi
SIG="sha256=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)"
curl -s -X POST http://localhost:3000/api/github/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: $EVENT" \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$PAYLOAD"
echo
