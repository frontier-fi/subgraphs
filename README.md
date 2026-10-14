# Balancer v3 Subgraphs

pnpm monorepo with Balancer v3 vault and pools subgraphs, deployed to Ormi.

## Prerequisites

- Node.js 22+
- pnpm 12+

## Setup

```bash
pnpm install
pnpm generate-manifests
pnpm codegen
```

Or in one shot (install + manifests + codegen + all network builds):

```bash
pnpm build:all
```

## Development

```bash
pnpm pools <command>  # e.g. pnpm pools build
pnpm vault <command>  # e.g. pnpm vault build
```

Contract addresses live in `networks.json`. Manifests (`subgraph*.yaml`) are generated from `subgraphs/*/template.yaml` via `pnpm generate-manifests` and are gitignored — always regenerate before build/deploy.

## Deployment

Deploys go to [Ormi](https://ormilabs.com) via `@graphprotocol/graph-cli`. Subgraph names follow `{vault|pools}-{network}` (e.g. `vault-mainnet`, `pools-sepolia`). The version label is the short git SHA.

### CI

GitHub Actions (`.github/workflows/deploy.yml`) deploys on merge to `main` (when subgraphs / `networks.json` / scripts change), or via manual workflow dispatch. Requires the `ORMI_DEPLOY_KEY` secret.

### Local

1. Create an API key in the Ormi dashboard and export it:

   ```bash
   export ORMI_DEPLOY_KEY=your_key_here
   ```

2. Build first (same as CI):

   ```bash
   pnpm install
   pnpm generate-manifests
   pnpm codegen
   pnpm vault build subgraph.mainnet.yaml   # or subgraph.sepolia.yaml
   pnpm pools build subgraph.mainnet.yaml
   ```

3. Deploy with `scripts/deploy.sh`:

   ```bash
   # usage: bash scripts/deploy.sh <vault|pools> [network]
   # network: mainnet | sepolia  (omit for all)

   bash scripts/deploy.sh vault sepolia
   bash scripts/deploy.sh pools sepolia

   # all networks for one subgraph
   bash scripts/deploy.sh vault
   bash scripts/deploy.sh pools
   ```

The script runs `graph deploy` against Ormi’s node/IPFS endpoints (`api.subgraph.ormilabs.com`). Prefer sepolia for smoke tests before mainnet.
