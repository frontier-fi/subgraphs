#!/bin/bash

# Exit on error
set -e

# Configuration
GRAPH_NODE="https://api.subgraph.ormilabs.com/deploy"
IPFS_NODE="https://api.subgraph.ormilabs.com/ipfs"
DEPLOY_KEY="${ORMI_DEPLOY_KEY}"

# Check if deploy key is set
if [ -z "$DEPLOY_KEY" ]; then
  echo "Error: ORMI_DEPLOY_KEY environment variable is not set"
  exit 1
fi

# Get the latest git commit hash
VERSION=$(git rev-parse --short HEAD)

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
  NETWORKS=($(node -e "console.log(Object.keys(require('./networks.json')).join(' '))"))
  echo "Deploying to all networks from networks.json: ${NETWORKS[*]}"
fi

echo "Deploying with version ${VERSION}..."
echo ""

FAILED=0

# Deploy each network
for network in "${NETWORKS[@]}"; do
  SUBGRAPH_NAME="${SUBGRAPH_TYPE}-${network}"

  SUBGRAPH_FILE="subgraph.${network}.yaml"

  if [ ! -f "subgraphs/${SUBGRAPH_TYPE}/$SUBGRAPH_FILE" ]; then
    echo "Warning: ${SUBGRAPH_FILE} not found, skipping..."
    continue
  fi

  echo "Deploying ${SUBGRAPH_NAME}..."
  echo "  Version: ${VERSION}"

  # Deploy the subgraph
  echo "  Deploying..."
  if (cd "subgraphs/${SUBGRAPH_TYPE}" && npx graph deploy "$SUBGRAPH_NAME" "$SUBGRAPH_FILE" \
    --node "$GRAPH_NODE" \
    --ipfs "$IPFS_NODE" \
    --deploy-key "$DEPLOY_KEY" \
    --version-label "${VERSION}"); then
    echo "  ✓ Successfully deployed ${SUBGRAPH_NAME} ${VERSION}"
  else
    echo "  ✗ Failed to deploy ${SUBGRAPH_NAME}"
    FAILED=1
  fi

  echo ""
done

if [ "$FAILED" -eq 1 ]; then
  echo "Deployment completed with errors!"
  exit 1
fi

echo "Deployment complete!"
