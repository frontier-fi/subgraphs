#!/bin/bash

# Exit on error
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
if [ -z "$1" ]; then
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
if [ -n "$2" ]; then
  NETWORKS=("$2")
  echo "Deploying to specific network: ${2}"
else
  # shellcheck disable=SC2207
  NETWORKS=($(node -e "console.log(Object.keys(require('${ROOT}/networks.json')).join(' '))"))
  echo "Deploying to all networks from networks.json: ${NETWORKS[*]}"
fi

echo "Deploying with version ${VERSION}..."
echo ""

FAILED=0

# Deploy each network
for network in "${NETWORKS[@]}"; do
  SUBGRAPH_NAME="${SUBGRAPH_TYPE}-${network}"
  SUBGRAPH_FILE="subgraph.${network}.yaml"

  if [ ! -f "${ROOT}/subgraphs/${SUBGRAPH_TYPE}/$SUBGRAPH_FILE" ]; then
    echo "Warning: ${SUBGRAPH_FILE} not found, skipping..."
    continue
  fi

  echo "Deploying ${SUBGRAPH_NAME}..."
  echo "  Version: ${VERSION}"
  echo "  Deploying..."

  LOG="$(mktemp)"
  if (cd "${ROOT}/subgraphs/${SUBGRAPH_TYPE}" && npx graph deploy "$SUBGRAPH_NAME" "$SUBGRAPH_FILE" \
    --node "$GRAPH_NODE" \
    --ipfs "$IPFS_NODE" \
    --deploy-key "$DEPLOY_KEY" \
    --version-label "${VERSION}" 2>&1 | tee "$LOG"); then
    echo "  ✓ Successfully deployed ${SUBGRAPH_NAME} ${VERSION}"

    DEPLOYMENT_ID="$(grep -Eo 'Build completed:[[:space:]]*[^[:space:]]+' "$LOG" | awk '{print $3}' | tail -1 || true)"

    node "${ROOT}/scripts/record-deployment.js" \
      "$SUBGRAPH_NAME" \
      "$SUBGRAPH_TYPE" \
      "$network" \
      "$VERSION" \
      "${DEPLOYMENT_ID:-}"
  else
    echo "  ✗ Failed to deploy ${SUBGRAPH_NAME}"
    FAILED=1
  fi

  rm -f "$LOG"
  echo ""
done

if [ "$FAILED" -eq 1 ]; then
  echo "Deployment completed with errors!"
  exit 1
fi

echo "Deployment complete!"
