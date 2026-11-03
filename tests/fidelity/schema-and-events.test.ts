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
    expect(entities).toMatch(/tokenType\s*!=\s*0/);
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

  it("Swap.user is the transaction sender", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/mappings/vault.ts"),
      "handleSwap"
    )!;
    expect(body).toMatch(/swap\.user\s*=\s*event\.transaction\.from/);
  });

  it("PoolToken stores tokenType and StableParams stores amp ramp fields", () => {
    const poolToken = schemaFields(
      "PoolToken",
      "subgraphs/vault/schema.graphql"
    );
    expect(poolToken).toContain("tokenType");
    expect(poolToken).toContain("vaultCreatorSwapFeeBalance");
    const stable = schemaFields(
      "StableParams",
      "subgraphs/pools/schema.graphql"
    );
    for (const f of [
      "ampIsUpdating",
      "ampStartValue",
      "ampEndValue",
      "ampStartTime",
      "ampEndTime",
    ]) {
      expect(stable).toContain(f);
    }
  });

  it("LiquidityAddedToBuffer applies absolute bufferBalances like Wrap", () => {
    const src = readRepo("subgraphs/vault/src/mappings/vault.ts");
    for (const name of [
      "handleLiquidityAddedToBuffer",
      "handleLiquidityRemovedFromBuffer",
      "handleWrap",
      "handleUnwrap",
    ] as const) {
      const body = extractFunction(src, name)!;
      expect(body).toMatch(/applyBufferBalancesFromEvent/);
    }
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

  it("a factory stored with version 0 is filled in by a later pool", () => {
    const schema = readRepo("subgraphs/pools/schema.graphql");
    expect(schema).toMatch(/type Factory @entity\(immutable: false\)/);
    const body = extractFunction(
      readRepo("subgraphs/pools/src/helpers/entities.ts"),
      "getFactory"
    )!;
    expect(body).toMatch(/factory\.version\s*==\s*0\s*&&\s*version\s*!=\s*0/);
  });
});

describe("Manifest generation", () => {
  it("ambiguous networks skip constants instead of throwing", () => {
    const src = readRepo("scripts/generate-manifests.js");
    const resolve = extractFunction(src, "resolveConstantsNetwork")!;
    expect(resolve).not.toMatch(/throw new Error\(\s*['"]Multiple networks/);
    expect(resolve).toMatch(/return null/);
    expect(src).toMatch(/if\s*\(\s*constantsNetwork\s*\)/);
  });
});
