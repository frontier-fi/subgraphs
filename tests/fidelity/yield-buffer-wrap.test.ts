import { describe, expect, it } from "vitest";
import { extractFunction, readRepo, schemaFields } from "./helpers/source";

describe("Yield fee RPC skip", () => {
  it("updateProtocolYieldFeeAmounts skips zero-fee pools and non-yield tokens before the eth_call", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/helpers/entities.ts"),
      "updateProtocolYieldFeeAmounts"
    )!;
    const callAt = body.search(/try_getAggregateYieldFeeAmount/);
    // Exempt pools can still have creator or governance yield fees: gate on
    // the aggregate fee and Recovery Mode, like the Vault's PoolDataLib.
    expect(body).not.toMatch(/pool\.protocolFeeExempt/);
    const gateAt = body.search(
      /if\s*\(\s*pool\.aggregateYieldFee\.equals\(\s*ZERO_BD\s*\)\s*\|\|\s*pool\.isInRecoveryMode\s*\)\s*return/
    );
    const noneAt = body.search(/if\s*\(\s*!anyPaysYield\s*\)\s*return/);
    const skipToken = body.search(/if\s*\(\s*!poolToken\.paysYieldFees\s*\)\s*continue/);
    expect(gateAt).toBeGreaterThanOrEqual(0);
    expect(noneAt).toBeGreaterThan(gateAt);
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

  it("handlePoolRegistered flags ERC-4626 tokens without creating a Buffer", () => {
    const registered = extractFunction(
      readRepo("subgraphs/vault/src/mappings/vault.ts"),
      "handlePoolRegistered"
    )!;
    const probe = extractFunction(
      readRepo("subgraphs/vault/src/helpers/entities.ts"),
      "probeErc4626"
    )!;
    expect(registered).toMatch(/tokenConfig\.tokenType\s*!=\s*0/);
    expect(registered).toMatch(/probeErc4626\(\s*tokenConfig\.token\s*\)/);
    const probeAt = registered.search(/probeErc4626/);
    const create = registered.search(/createPoolToken/);
    expect(probeAt).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThan(probeAt);
    expect(probe).toMatch(/try_asset\(\)/);
    expect(probe).toMatch(/assetCall\.reverted\s*\|\|\s*assetCall\.value\.equals\(\s*ZERO_ADDRESS\s*\)/);
    expect(probe).toMatch(/isErc4626\s*=\s*true/);
    expect(probe).toMatch(/underlyingToken\s*=\s*underlyingToken\.id/);
    expect(probe).toMatch(/return null/);
    // Vault buffers only exist after initializeBuffer, so no Buffer here.
    expect(probe).not.toMatch(/new Buffer\(/);
    expect(registered).not.toMatch(/new Buffer\(|getBuffer\(/);
  });

  it("getBuffer returns an existing Buffer without token writes or eth_calls", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/mappings/vault.ts"),
      "getBuffer"
    )!;
    expect(body).toMatch(
      /let buffer = Buffer\.load\(\s*wrappedTokenAddress\s*\);\s*if\s*\(\s*buffer\s*\)\s*return buffer;/
    );
    const loadAt = body.search(/Buffer\.load/);
    const probeAt = body.search(/probeErc4626/);
    expect(probeAt).toBeGreaterThan(loadAt);
    expect(body).not.toMatch(/isErc4626\s*=/);
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

  it("handleWrap and handleUnwrap record the event only at or after storeEventsFrom", () => {
    const src = readRepo("subgraphs/vault/src/mappings/vault.ts");
    const wrap = extractFunction(src, "handleWrap")!;
    const unwrap = extractFunction(src, "handleUnwrap")!;
    const record = extractFunction(src, "recordWrapUnwrap")!;
    // Wrap: amountIn = underlying, amountOut = shares (Vault.sol emit Wrap).
    expect(wrap).toMatch(
      /recordWrapUnwrap\(\s*event,\s*buffer,\s*"Wrap",\s*event\.params\.mintedShares,\s*event\.params\.depositedUnderlying\s*\)/
    );
    expect(unwrap).toMatch(
      /recordWrapUnwrap\(\s*event,\s*buffer,\s*"Unwrap",\s*event\.params\.burnedShares,\s*event\.params\.withdrawnUnderlying\s*\)/
    );
    expect(record).toMatch(/new BufferWrapUnwrap/);
    expect(record).toMatch(/entry\.user\s*=\s*event\.transaction\.from/);
    expect(record).toMatch(
      /event\.block\.number\s*<\s*storeEventsFrom\.toBigInt\(\)/
    );
    expect(record).toMatch(/entry\.save\(\)/);
  });
});
