#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm install
pnpm generate-manifests
pnpm codegen

for pkg in vault pools; do
  shopt -s nullglob
  manifests=("subgraphs/${pkg}"/subgraph.*.yaml)
  shopt -u nullglob

  if [ ${#manifests[@]} -eq 0 ]; then
    echo "No manifests found for ${pkg}, skipping"
    continue
  fi

  for manifest in "${manifests[@]}"; do
    file="$(basename "$manifest")"
    # subgraph.<network>.yaml → network (keeps vault constants.ts in sync per build)
    network="${file#subgraph.}"
    network="${network%.yaml}"
    if [ "$pkg" = "vault" ]; then
      echo ":: generating vault constants for ${network}"
      GENERATE_NETWORK="$network" pnpm generate-manifests
    fi
    echo ":: building ${pkg} (${file})"
    pnpm "$pkg" build "$file"
  done
done

echo "All builds completed"
