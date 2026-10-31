import { describe, expect, it } from "vitest";
import {
  extractFunction,
  handlersFromTemplate,
  readRepo,
  schemaFields,
} from "./helpers/source";

describe("Schema and event fidelity", () => {
  it("storeEventsFrom includes the threshold block (>=)", () => {
    const src = readRepo("subgraphs/vault/src/mappings/vault.ts");
    expect(src).toMatch(
      /event\.block\.number\s*>=\s*storeEventsFrom\.toBigInt\(\)/
    );
    expect(src).not.toMatch(
      /event\.block\.number\s*>\s*storeEventsFrom\.toBigInt\(\)/
    );
  });

  it("Vault.authorizer is seeded from getAuthorizer and AuthorizerChanged is handled", () => {
    const entities = extractFunction(
      readRepo("subgraphs/vault/src/helpers/entities.ts"),
      "getVault"
    )!;
    const handled = handlersFromTemplate("subgraphs/vault/template.yaml");
    expect(entities).toMatch(/getAuthorizer/);
    expect(handled.has("AuthorizerChanged")).toBe(true);
  });

  it("VaultPausedStateChanged is handled", () => {
    const handled = handlersFromTemplate("subgraphs/vault/template.yaml");
    expect(handled.has("VaultPausedStateChanged")).toBe(true);
  });

  it("priceRate is refreshed from vault rates after registration", () => {
    const vaultTs = readRepo("subgraphs/vault/src/mappings/vault.ts");
    const entities = readRepo("subgraphs/vault/src/helpers/entities.ts");
    expect(vaultTs).toMatch(/updatePoolTokenRates/);
    expect(entities).toMatch(/priceRate\s*=/);
    expect(entities).toMatch(/getPoolTokenRates/);
  });

  it("AddRemove records liquidity kind and totalSupply", () => {
    const fields = schemaFields("AddRemove", "subgraphs/vault/schema.graphql");
    expect(fields).toContain("kind");
    expect(fields.some((f) => f === "totalSupply" || f === "bptAmount")).toBe(
      true
    );
    const src = readRepo("subgraphs/vault/src/mappings/vault.ts");
    expect(src).toMatch(/event\.params\.kind/);
  });

  it("Swap.user is not blindly transaction.from", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/mappings/vault.ts"),
      "handleSwap"
    )!;
    expect(body).not.toMatch(/swap\.user\s*=\s*event\.transaction\.from/);
  });
});

describe("Pools factory versioning", () => {
  it("pool factory versions are not hardcoded literals", () => {
    const sources = [
      readRepo("subgraphs/pools/src/mappings/weighted.ts"),
      readRepo("subgraphs/pools/src/mappings/stable.ts"),
      readRepo("subgraphs/pools/src/mappings/eclp.ts"),
    ].join("\n");
    expect(sources).toMatch(/getVersion|factoryVersion|VERSION/);
  });
});
