import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  extractAddressLiteral,
  readJson,
  readRepo,
  repoRoot,
} from "./helpers/source";

describe("Vault address fidelity", () => {
  it("constants.ts is generated from networks.json Vault.address", () => {
    execFileSync("node", ["scripts/generate-manifests.js"], {
      cwd: repoRoot(),
      stdio: "pipe",
    });

    const constants = readRepo("subgraphs/vault/src/helpers/constants.ts");
    const template = readRepo(
      "subgraphs/vault/src/helpers/constants.template.ts"
    );
    const networks = readJson<{ sepolia: { Vault: { address: string } } }>(
      "networks.json"
    );

    expect(template).toMatch(/\{\{\s*Vault\.address\s*\}\}/);
    expect(constants).not.toMatch(/\{\{\s*Vault\.address\s*\}\}/);

    const generated = extractAddressLiteral(constants, "VAULT_ADDRESS");
    expect(generated?.toLowerCase()).toBe(
      networks.sepolia.Vault.address.toLowerCase()
    );
  });
});
