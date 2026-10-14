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

pnpm pools <command>  # e.g. pnpm pools build
pnpm vault <command>  # e.g. pnpm vault build
```

Contract addresses live in `networks.json`. Manifests (`subgraph*.yaml`) are generated from `subgraphs/*/template.yaml` via `pnpm generate-manifests` and are gitignored — always regenerate before build.

Full local check (install + manifests + codegen + all network builds):

```bash
pnpm build:all
```

## Deployment

Deploys only run in CI (`.github/workflows/deploy.yml`) — not locally. Triggers:

- push to `main` when `subgraphs/**`, `networks.json`, or `scripts/**` change
- manual **workflow_dispatch** (pick subgraph + network, or `all`)

Requires the `ORMI_DEPLOY_KEY` repo secret. Per-target deploy failures (version already exists, plan limit, etc.) are warned and skipped so the rest of the matrix still runs; download the `deployments` artifact for what succeeded.

Subgraph names: `{vault|pools}-{network}` (e.g. `vault-sepolia`). Version label: short git SHA.

After a run, download the `deployments` artifact for `deployments.json` (`latest` + `history`) with:

```
https://api.subgraph.ormilabs.com/api/public/<accountId>/subgraphs/<name>/<version>/gn
https://api.subgraph.ormilabs.com/api/public/<accountId>/subgraphs/<name>/latest/gn
https://api.subgraph.ormilabs.com/api/public/query_deployment?subgraph_id=<id>
https://api.subgraph.ormilabs.com/api/subgraph/ipfs/cat?arg=<id>
```
