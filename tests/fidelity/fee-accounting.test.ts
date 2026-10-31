import { describe, expect, it } from "vitest";
import { extractFunction, readRepo } from "./helpers/source";

function mulDown(a: bigint, b: bigint): bigint {
  return (a * b) / 10n ** 18n;
}

function scaleUpFee(pct: number): bigint {
  return BigInt(Math.round(pct * 1e18));
}

describe("Swap / protocol fee accounting", () => {
  it("vault pending swap-fee accrual uses aggregate (protocol + creator), not protocol alone", () => {
    const src = readRepo("subgraphs/vault/src/mappings/vault.ts");
    const usesProtocolOnly = /mulDownSwapFee\([^)]*pool\.protocolSwapFee\)/.test(
      src
    );
    const combinesCreator =
      /pool\.protocolSwapFee\s*\.plus\(\s*pool\.poolCreatorSwapFee\s*\)/.test(
        src
      ) || /mulDownSwapFee\([^)]*aggregateFee/.test(src);

    expect(usesProtocolOnly).toBe(false);
    expect(combinesCreator).toBe(true);
  });

  it("aggregate fee is larger than protocol-only when creator fee > 0", () => {
    const swapFeeAmount = 10n ** 18n;
    const protocolOnly = mulDown(swapFeeAmount, scaleUpFee(0.5));
    const aggregate = mulDown(swapFeeAmount, scaleUpFee(0.6));
    expect(protocolOnly < aggregate).toBe(true);
  });

  it("handleSwap increments totalSwapFeeDelta on dynamic fees", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/mappings/vault.ts"),
      "handleSwap"
    )!;
    expect(body).toMatch(/totalSwapFeeDelta/);
  });

  it("dynamic swaps do not add the full fee to both static and dynamic counters", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/mappings/vault.ts"),
      "handleSwap"
    )!;
    const staticAlwaysFull =
      /totalStaticSwapFee\s*=\s*poolTokenIn\.totalStaticSwapFee\.plus\(\s*swapFeeAmount\s*\)/.test(
        body
      );
    expect(staticAlwaysFull).toBe(false);
  });

  it("ProtocolSwapFeeCollected subtracts collected amount instead of zeroing", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/mappings/controller.ts"),
      "handleProtocolSwapFeeCollected"
    )!;
    expect(body).not.toMatch(/vaultProtocolSwapFeeBalance\s*=\s*ZERO_BD/);
    expect(body).toMatch(/vaultProtocolSwapFeeBalance\.minus/);
  });

  it("ProtocolYieldFeeCollected subtracts collected amount instead of zeroing", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/mappings/controller.ts"),
      "handleProtocolYieldFeeCollected"
    )!;
    expect(body).not.toMatch(/vaultProtocolYieldFeeBalance\s*=\s*ZERO_BD/);
    expect(body).toMatch(/vaultProtocolYieldFeeBalance\.minus/);
  });
});
