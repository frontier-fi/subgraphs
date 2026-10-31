import { describe, expect, it } from "vitest";
import { extractFunction, readRepo } from "./helpers/source";

function scaleDown(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

describe("Buffer Wrap/Unwrap decimal scaling", () => {
  it("handleWrap scales each balance with its own token decimals", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/mappings/vault.ts"),
      "handleWrap"
    );
    expect(body).toBeTruthy();
    expect(body!).toMatch(
      /underlyingBalance\s*=\s*scaleDown\(\s*hexToBigInt\(underlyingBalance\),\s*underlyingToken\.decimals/s
    );
    expect(body!).toMatch(
      /wrappedBalance\s*=\s*scaleDown\(\s*hexToBigInt\(wrappedBalance\),\s*wrappedToken\.decimals/s
    );
  });

  it("handleUnwrap scales each balance with its own token decimals", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/mappings/vault.ts"),
      "handleUnwrap"
    );
    expect(body).toBeTruthy();
    expect(body!).toMatch(
      /underlyingBalance\s*=\s*scaleDown\(\s*hexToBigInt\(underlyingBalance\),\s*underlyingToken\.decimals/s
    );
    expect(body!).toMatch(
      /wrappedBalance\s*=\s*scaleDown\(\s*hexToBigInt\(wrappedBalance\),\s*wrappedToken\.decimals/s
    );
  });

  it("correct scaling keeps human balances when decimals differ (18 vs 6)", () => {
    const wrappedRaw = 5n * 10n ** 18n;
    const underlyingRaw = 5n * 10n ** 6n;
    expect(scaleDown(wrappedRaw, 18)).toBe(5);
    expect(scaleDown(underlyingRaw, 6)).toBe(5);
    // Swapped decimals (current bug) would yield 5e12 and ~5e-12
    expect(scaleDown(wrappedRaw, 6)).not.toBe(5);
    expect(scaleDown(underlyingRaw, 18)).not.toBe(5);
  });
});
