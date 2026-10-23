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

Contract addresses live in `networks.json`. Manifests (`subgraph.<network>.yaml`) are generated from `subgraphs/*/template.yaml` via `pnpm generate-manifests` and are gitignored — always regenerate before build, and always pass the network manifest to `build` / `codegen`.

Full local check (install + manifests + codegen + all network builds):

```bash
pnpm build:all
```

## Deployment

Deploys only run in CI (`.github/workflows/deploy.yml`) — not locally. Triggers:

- push to `main` when `subgraphs/**`, `networks.json`, or `scripts/**` change
- manual **workflow_dispatch** (pick subgraph + network, or `all`)

Requires the `ORMI_DEPLOY_KEY` repo secret. Per-target deploy failures (version already exists, plan limit, etc.) are warned and skipped so the rest of the matrix still runs. Successful deploys are printed in the job log and Summary (endpoints / query URLs), and the Ormi `latest` tag is pointed at that version so `…/subgraphs/{name}/latest/gn` keeps working.

Subgraph names: `{vault|pools}-{network}` (e.g. `vault-sepolia`). Version label: short git SHA.
