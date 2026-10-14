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
    echo ":: building ${pkg} (${file})"
    pnpm "$pkg" build "$file"
  done
done

echo "All builds completed"
