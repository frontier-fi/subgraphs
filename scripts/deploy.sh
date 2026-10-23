#!/bin/bash

# Exit on error for setup; deploy failures are handled per-target below.
set -euo pipefail

if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
  echo "Error: deploy.sh only runs in GitHub Actions. Use the Deploy workflow (push to main or workflow_dispatch)."
  exit 1
fi

# Configuration
GRAPH_NODE="https://api.subgraph.ormilabs.com/deploy"
IPFS_NODE="https://api.subgraph.ormilabs.com/ipfs"
DEPLOY_KEY="${ORMI_DEPLOY_KEY}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "$DEPLOY_KEY" ]; then
  echo "Error: ORMI_DEPLOY_KEY secret is not set"
  exit 1
fi

# Get the latest git commit hash
VERSION=$(git -C "$ROOT" rev-parse --short HEAD)

if [ -z "$VERSION" ]; then
  echo "Error: Failed to get git commit hash"
  exit 1
fi

echo "Using git commit hash as version: ${VERSION}"
echo ""

# Get subgraph type (required) and network (optional)
if [ -z "${1:-}" ]; then
  echo "Error: Subgraph type is required (vault or pools)"
  exit 1
fi

SUBGRAPH_TYPE="$1"

if [ "$SUBGRAPH_TYPE" != "vault" ] && [ "$SUBGRAPH_TYPE" != "pools" ]; then
  echo "Error: Invalid subgraph type. Must be 'vault' or 'pools'"
  exit 1
fi

echo "Deploying ${SUBGRAPH_TYPE} subgraphs..."
echo ""

# List of networks to deploy (from networks.json when not specified)
if [ -n "${2:-}" ]; then
  NETWORKS=("$2")
  echo "Deploying to specific network: ${2}"
else
  # shellcheck disable=SC2207
  NETWORKS=($(node -e "console.log(Object.keys(require('${ROOT}/networks.json')).join(' '))"))
  echo "Deploying to all networks from networks.json: ${NETWORKS[*]}"
fi

echo "Deploying with version ${VERSION}..."
echo ""

SUCCEEDED=0
FAILED=0
SKIPPED=0

# Deploy each network — failures (already exists, plan limit, etc.) are non-fatal
for network in "${NETWORKS[@]}"; do
  SUBGRAPH_NAME="${SUBGRAPH_TYPE}-${network}"
  SUBGRAPH_FILE="subgraph.${network}.yaml"

  if [ ! -f "${ROOT}/subgraphs/${SUBGRAPH_TYPE}/$SUBGRAPH_FILE" ]; then
    echo "Warning: ${SUBGRAPH_FILE} not found, skipping..."
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "Deploying ${SUBGRAPH_NAME}..."
  echo "  Version: ${VERSION}"
  echo "  Deploying..."

  LOG="$(mktemp)"
  set +e
  (cd "${ROOT}/subgraphs/${SUBGRAPH_TYPE}" && npx graph deploy "$SUBGRAPH_NAME" "$SUBGRAPH_FILE" \
    --node "$GRAPH_NODE" \
    --ipfs "$IPFS_NODE" \
    --deploy-key "$DEPLOY_KEY" \
    --version-label "${VERSION}" 2>&1 | tee "$LOG")
  DEPLOY_STATUS=${PIPESTATUS[0]}
  set -e

  if [ "$DEPLOY_STATUS" -eq 0 ]; then
    echo "  ✓ Successfully deployed ${SUBGRAPH_NAME} ${VERSION}"
    SUCCEEDED=$((SUCCEEDED + 1))

    DEPLOYMENT_ID="$(grep -Eo 'Build completed:[[:space:]]*[^[:space:]]+' "$LOG" | awk '{print $3}' | tail -1 || true)"

    node "${ROOT}/scripts/record-deployment.js" \
      "$SUBGRAPH_NAME" \
      "$SUBGRAPH_TYPE" \
      "$network" \
      "$VERSION" \
      "${DEPLOYMENT_ID:-}"

    if node "${ROOT}/scripts/tag-latest.js" "$SUBGRAPH_NAME" "$VERSION"; then
      echo "  ✓ Tagged ${SUBGRAPH_NAME} latest → ${VERSION}"
    else
      echo "  ⚠ Deployed but failed to set latest tag for ${SUBGRAPH_NAME}"
      echo "::warning title=Tag ${SUBGRAPH_NAME}::failed to set latest → ${VERSION}"
    fi
  else
    REASON="$(grep -Eo 'E[0-9]{3}:[^[:space:]].*' "$LOG" | tail -1 || true)"
    if [ -z "$REASON" ]; then
      REASON="see log above"
    fi
    echo "  ⚠ Skipped ${SUBGRAPH_NAME}: ${REASON}"
    echo "::warning title=Deploy ${SUBGRAPH_NAME}::${REASON}"
    FAILED=$((FAILED + 1))
  fi

  rm -f "$LOG"
  echo ""
done

echo "Deployment summary (${SUBGRAPH_TYPE}): ${SUCCEEDED} succeeded, ${FAILED} skipped/failed, ${SKIPPED} missing manifest"
echo "Deployment complete!"
# Always succeed so remaining targets (and the summary step) still run.
exit 0
