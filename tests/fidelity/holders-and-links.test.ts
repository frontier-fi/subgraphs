import { describe, expect, it } from "vitest";
import { extractFunction, readRepo } from "./helpers/source";

describe("Holders, rate providers, and late links", () => {
  it("BPT transfer never creates a zero-address PoolShare or counts it as a holder", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/mappings/bpt.ts"),
      "handleTransfer"
    )!;
    // Mint branch must not touch event.params.from (the zero address).
    const mintBranch = body.match(
      /if\s*\(\s*isMint\s*\)\s*\{([\s\S]*?)\}\s*else if\s*\(\s*isBurn/
    );
    expect(mintBranch).toBeTruthy();
    expect(mintBranch![1]).toMatch(
      /getPoolShare\(\s*poolAddress,\s*event\.params\.to\s*\)/
    );
    expect(mintBranch![1]).not.toMatch(/event\.params\.from/);
    // Minimum supply is minted Transfer(0x0, 0x0): the PoolShare lookup must be guarded.
    expect(mintBranch![1]).toMatch(
      /if\s*\(\s*event\.params\.to\s*!=\s*ZERO_ADDRESS\s*\)\s*\{[\s\S]*getPoolShare\(/
    );
    expect(body).toMatch(/event\.params\.to\s*!=\s*ZERO_ADDRESS/);
    expect(body).toMatch(/event\.params\.from\s*!=\s*ZERO_ADDRESS/);
    expect(body).toMatch(/balance\.le\(\s*ZERO_BD\s*\)/);
    expect(body).toMatch(/event\.params\.from\s*==\s*event\.params\.to/);
  });

  it("createRateProvider writes one row per token, including address(0)", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/helpers/entities.ts"),
      "createRateProvider"
    )!;
    expect(body).not.toMatch(/if\s*\(\s*tokenConfig\.rateProvider\.equals\(\s*ZERO_ADDRESS\s*\)\s*\)/);
    expect(body).toMatch(/rateProvider\.address\s*=\s*tokenConfig\.rateProvider/);
    expect(body).toMatch(/rateProvider\.save\(\)/);
  });

  it("createPoolToken links the Token entity for derived backfills", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/helpers/entities.ts"),
      "createPoolToken"
    )!;
    expect(body).toMatch(/poolToken\.token\s*=\s*token\.id/);
    expect(body).toMatch(/poolToken\.rateProvider\s*=\s*tokenConfig\.rateProvider/);
  });

  it("new buffers and pools backfill PoolToken.buffer / nestedPool", () => {
    const entities = readRepo("subgraphs/vault/src/helpers/entities.ts");
    const vault = readRepo("subgraphs/vault/src/mappings/vault.ts");
    expect(entities).toMatch(/function linkBufferToPoolTokens/);
    expect(entities).toMatch(/function linkNestedPoolToPoolTokens/);
    expect(vault).toMatch(/linkBufferToPoolTokens\(/);
    expect(vault).toMatch(/linkNestedPoolToPoolTokens\(/);
    const bufferLink = extractFunction(entities, "linkBufferToPoolTokens")!;
    const nestedLink = extractFunction(entities, "linkNestedPoolToPoolTokens")!;
    expect(bufferLink).toMatch(/Pool\.load\(\s*poolToken\.pool\s*\)/);
    expect(bufferLink).toMatch(/pool\.save\(\)/);
    expect(nestedLink).toMatch(/Pool\.load\(\s*poolToken\.pool\s*\)/);
    expect(nestedLink).toMatch(/pool\.save\(\)/);
  });
});
