import { describe, expect, it } from "vitest";
import { extractFunction, readRepo, schemaFields } from "./helpers/source";

describe("Yield fee RPC skip", () => {
  it("updateProtocolYieldFeeAmounts skips exempt pools and non-yield tokens before the eth_call", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/helpers/entities.ts"),
      "updateProtocolYieldFeeAmounts"
    )!;
    const callAt = body.search(/try_getAggregateYieldFeeAmount/);
    const exemptAt = body.search(/if\s*\(\s*pool\.protocolFeeExempt\s*\)\s*return/);
    const noneAt = body.search(/if\s*\(\s*!anyPaysYield\s*\)\s*return/);
    const skipToken = body.search(/if\s*\(\s*!poolToken\.paysYieldFees\s*\)\s*continue/);
    expect(exemptAt).toBeGreaterThanOrEqual(0);
    expect(noneAt).toBeGreaterThan(exemptAt);
    expect(callAt).toBeGreaterThan(noneAt);
    expect(skipToken).toBeGreaterThanOrEqual(0);
    expect(skipToken).toBeLessThan(callAt);
  });
});

describe("ERC-4626 buffer at registration", () => {
  it("Token schema stores isErc4626 and underlyingToken", () => {
    const fields = schemaFields("Token", "subgraphs/vault/schema.graphql");
    expect(fields).toContain("isErc4626");
    expect(fields).toContain("underlyingToken");
  });

  it("new Token entities default isErc4626 to false", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/helpers/entities.ts"),
      "createToken"
    )!;
    expect(body).toMatch(/isErc4626\s*=\s*false/);
    expect(body).toMatch(/underlyingToken\s*=\s*null/);
  });

  it("handlePoolRegistered probes non-standard tokens with try_asset before creating the pool token", () => {
    const registered = extractFunction(
      readRepo("subgraphs/vault/src/mappings/vault.ts"),
      "handlePoolRegistered"
    )!;
    const init = extractFunction(
      readRepo("subgraphs/vault/src/helpers/entities.ts"),
      "tryInitErc4626Buffer"
    )!;
    expect(registered).toMatch(/tokenConfig\.tokenType\s*!=\s*0/);
    expect(registered).toMatch(/tryInitErc4626Buffer\(\s*tokenConfig\.token\s*\)/);
    const probe = registered.search(/tryInitErc4626Buffer/);
    const create = registered.search(/createPoolToken/);
    expect(probe).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThan(probe);
    expect(init).toMatch(/try_asset\(\)/);
    expect(init).toMatch(/assetCall\.reverted\s*\|\|\s*assetCall\.value\.equals\(\s*ZERO_ADDRESS\s*\)/);
    expect(init).toMatch(/isErc4626\s*=\s*true/);
    expect(init).toMatch(/underlyingToken\s*=\s*underlyingToken\.id/);
    expect(init).toMatch(/return null/);
  });
});

describe("BufferWrapUnwrap events", () => {
  it("schema and Vault template include BufferWrapUnwrap", () => {
    const fields = schemaFields(
      "BufferWrapUnwrap",
      "subgraphs/vault/schema.graphql"
    );
    for (const name of [
      "buffer",
      "type",
      "amountWrapped",
      "amountUnderlying",
      "wrappedBalance",
      "underlyingBalance",
      "user",
      "transactionHash",
    ]) {
      expect(fields).toContain(name);
    }
    const template = readRepo("subgraphs/vault/template.yaml");
    expect(template).toMatch(/-\s*BufferWrapUnwrap/);
  });

  it("handleWrap and handleUnwrap save the event only at or after storeEventsFrom", () => {
    const src = readRepo("subgraphs/vault/src/mappings/vault.ts");
    const wrap = extractFunction(src, "handleWrap")!;
    const unwrap = extractFunction(src, "handleUnwrap")!;
    expect(wrap).toMatch(/new BufferWrapUnwrap/);
    expect(wrap).toMatch(/entry\.type\s*=\s*"Wrap"/);
    expect(wrap).toMatch(/event\.params\.mintedShares/);
    expect(wrap).toMatch(/event\.params\.depositedUnderlying/);
    expect(unwrap).toMatch(/entry\.type\s*=\s*"Unwrap"/);
    expect(unwrap).toMatch(/event\.params\.burnedShares/);
    expect(unwrap).toMatch(/event\.params\.withdrawnUnderlying/);
    for (const body of [wrap, unwrap]) {
      expect(body).toMatch(/entry\.user\s*=\s*event\.transaction\.from/);
      expect(body).toMatch(
        /event\.block\.number\s*>=\s*storeEventsFrom\.toBigInt\(\)/
      );
      expect(body).toMatch(/entry\.save\(\)/);
    }
  });
});
