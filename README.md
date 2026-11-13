# Subgraphs

pnpm monorepo with vault and pools subgraphs, deployed to Ormi via GitHub Actions.

## Prerequisites

- Node.js 22+
- pnpm 12+

## Development

```bash
pnpm install
pnpm generate-manifests
pnpm codegen

pnpm pools <command>  # e.g. pnpm pools build subgraph.sepolia.yaml
pnpm vault <command>  # e.g. pnpm vault build subgraph.sepolia.yaml
```

Contract addresses live in `networks.json`. Manifests (`subgraph.<network>.yaml`) and `subgraphs/vault/src/helpers/constants.ts` are generated from templates via `pnpm generate-manifests` and are gitignored — always regenerate before build/test, and always pass the network manifest to `build` / `codegen`.

Full local check (install + manifests + codegen + all network builds):

```bash
pnpm build:all
```

## Fidelity tests

Vitest suite under `tests/fidelity` asserts onchain fidelity against the vault and pools mappings. Runs in CI on every PR to `main` (and on pushes to `main`).

```bash
pnpm test:fidelity
```

## Reconciliation

`pnpm reconcile` reads both subgraphs at the latest block they have both indexed and compares every pool, token, holder, buffer and fee balance with the contracts at that same block.

```bash
RPC_URL=<sepolia rpc> \
VAULT_SUBGRAPH_URL=<vault-sepolia query url> \
POOLS_SUBGRAPH_URL=<pools-sepolia query url> \
pnpm reconcile [--block <n>] [--json report.json] [--strict] [--tolerance <raw units>]
```

Each check is a `fact` (must match exactly), a `snapshot` (refreshed only on pool events, such as `priceRate` and `amp` during a ramp) or a `model` (subgraph fee attribution, allowed `--tolerance` raw units of drift, default 1000). The run exits 1 when a fact mismatches, or when anything mismatches with `--strict`. `NETWORK` selects the Vault address from `networks.json` (default `sepolia`).

## Deployment

Deploys only run in CI (`.github/workflows/deploy.yml`) — not locally. Triggers:

- push to `main` when `subgraphs/**`, `networks.json`, or `scripts/**` change
- manual **workflow_dispatch** (pick subgraph + network, or `all`)

Requires the `ORMI_DEPLOY_KEY` repo secret. Per-target deploy failures (version already exists, plan limit, etc.) are warned and skipped so the rest of the matrix still runs. Successful deploys are printed in the job log and Summary (endpoints / query URLs). Point the Ormi `latest` tag at a version in the dashboard when you want a stable `…/subgraphs/{name}/latest/gn` URL.

Subgraph names: `{vault|pools}-{network}` (e.g. `vault-sepolia`). Version label: short git SHA.
