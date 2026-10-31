import { describe, expect, it } from "vitest";
import {
  extractAddressLiteral,
  readJson,
  readRepo,
} from "./helpers/source";

describe("Vault address fidelity", () => {
  it("VAULT_ADDRESS matches the Sepolia Vault in networks.json (or getVault uses dataSource.address)", () => {
    const constants = readRepo("subgraphs/vault/src/helpers/constants.ts");
    const entities = readRepo("subgraphs/vault/src/helpers/entities.ts");
    const networks = readJson<{ sepolia: { Vault: { address: string } } }>(
      "networks.json"
    );

    const hardcoded = extractAddressLiteral(constants, "VAULT_ADDRESS");
    const usesDataSource = /dataSource\.address\(\)/.test(entities);
    const matchesNetwork =
      !!hardcoded &&
      hardcoded.toLowerCase() ===
        networks.sepolia.Vault.address.toLowerCase();

    expect(
      usesDataSource || matchesNetwork,
      `Sepolia Vault is ${networks.sepolia.Vault.address}; constants has ${hardcoded}`
    ).toBe(true);
  });
});
