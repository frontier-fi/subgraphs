import { describe, expect, it } from "vitest";
import { extractFunction, readRepo } from "./helpers/source";

function mulDown(a: bigint, b: bigint): bigint {
  return (a * b) / 10n ** 18n;
}

function scaleUpFee(pct: number): bigint {
  return BigInt(Math.round(pct * 1e18));
}

/** protocol + (1 - protocol) * creator, truncated to 1e11 (24-bit fee precision). */
function aggregateFeeRaw(protocolRaw: bigint, creatorRaw: bigint): bigint {
  const ONE = 10n ** 18n;
  const factor = 10n ** 11n;
  const raw = protocolRaw + ((ONE - protocolRaw) * creatorRaw) / ONE;
  return (raw / factor) * factor;
}

describe("Swap / protocol fee accounting", () => {
  it("aggregate fee is protocol plus creator on the remainder, not the sum", () => {
    const math = readRepo("subgraphs/vault/src/helpers/math.ts");
    const entities = readRepo("subgraphs/vault/src/helpers/entities.ts");
    const controller = readRepo("subgraphs/vault/src/mappings/controller.ts");
    expect(math).toMatch(/computeAggregateFeePercentageRaw/);
    expect(math).toMatch(/ONE\.minus\(protocolFeeRaw\)/);
    expect(entities).toMatch(/computeAggregateFeePercentageRaw/);
    expect(controller).not.toMatch(
      /protocolSwapFee\s*\.plus\(\s*pool\.poolCreatorSwapFee\s*\)/
    );
    expect(entities).not.toMatch(
      /protocolSwapFee\s*\.plus\(\s*pool\.poolCreatorSwapFee\s*\)/
    );

    const half = 5n * 10n ** 17n;
    const aggregate = aggregateFeeRaw(half, half);
    expect(aggregate).toBe(75n * 10n ** 16n);
    // 50% protocol + 50% creator => 75% aggregate, split 50:25 of the swap fee.
    const swapFee = 1000n;
    const protocolPart = (swapFee * half) / aggregate;
    const creatorPart = swapFee - protocolPart;
    expect(protocolPart).toBe(666n);
    expect(creatorPart).toBe(334n);
  });

  it("aggregate fee is larger than protocol-only when creator fee > 0", () => {
    const swapFeeAmount = 10n ** 18n;
    const protocolOnly = mulDown(swapFeeAmount, scaleUpFee(0.5));
    const aggregate = mulDown(swapFeeAmount, aggregateFeeRaw(scaleUpFee(0.5), scaleUpFee(0.5)));
    expect(protocolOnly < aggregate).toBe(true);
    expect(aggregate).toBe(mulDown(swapFeeAmount, scaleUpFee(0.75)));
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

  it("ProtocolSwapFeeCollected splits the full aggregate and clears vault pending", () => {
    const src = readRepo("subgraphs/vault/src/mappings/controller.ts");
    const body = extractFunction(src, "handleProtocolSwapFeeCollected")!;
    const apply = extractFunction(src, "applyCollected")!;
    expect(body + apply).toMatch(/splitAggregateAmount/);
    expect(apply).toMatch(/vaultProtocolSwapFeeBalance\s*=\s*ZERO_BD/);
    expect(apply).toMatch(/vaultCreatorSwapFeeBalance\s*=\s*ZERO_BD/);
    expect(apply).toMatch(/controllerCreatorFeeBalance/);
    expect(src).not.toMatch(/syncVaultAggregateSwapFeeFromChain/);
  });

  it("ProtocolYieldFeeCollected splits the full aggregate and clears vault pending", () => {
    const src = readRepo("subgraphs/vault/src/mappings/controller.ts");
    const apply = extractFunction(src, "applyCollected")!;
    expect(apply).toMatch(/vaultProtocolYieldFeeBalance\s*=\s*ZERO_BD/);
    expect(apply).toMatch(/vaultCreatorYieldFeeBalance\s*=\s*ZERO_BD/);
    expect(apply).toMatch(/floorAtZero|ZERO_BD/);
  });

  it("PoolCreatorFeesWithdrawn decrements controllerCreatorFeeBalance", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/mappings/controller.ts"),
      "handlePoolCreatorFeesWithdrawn"
    )!;
    expect(body).toMatch(/controllerCreatorFeeBalance = floorAtZero/);
  });

  it("fee-controller registration is stashed until the Pool entity exists", () => {
    const src = readRepo("subgraphs/vault/src/mappings/controller.ts");
    const vault = readRepo("subgraphs/vault/src/mappings/vault.ts");
    for (const name of [
      "handleInitialPoolAggregateSwapFeePercentage",
      "handleInitialPoolAggregateYieldFeePercentage",
      "handlePoolRegisteredWithFeeController",
    ]) {
      const body = extractFunction(src, name)!;
      expect(body).toMatch(/if\s*\(\s*!pool\s*\)/);
      expect(body).toMatch(/ensurePending|PendingPoolFeeInit/);
    }
    expect(vault).toMatch(/applyPendingPoolFeeInit/);
    expect(extractFunction(src, "applyPendingPoolFeeInit")!).toMatch(
      /store\.remove\(\s*"PendingPoolFeeInit"/
    );
  });

  it("swap fee accrual skips recovery mode and uses the Vault aggregate", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/helpers/entities.ts"),
      "accrueVaultSwapFee"
    )!;
    expect(body).toMatch(/if\s*\(\s*pool\.isInRecoveryMode\s*\)\s*return/);
    expect(body).toMatch(/pool\.aggregateSwapFee/);
    expect(body).not.toMatch(/aggregateFeePercentage\(/);
  });

  it("withdrawals do not drive controller balances negative", () => {
    const src = readRepo("subgraphs/vault/src/mappings/controller.ts");
    expect(src).toMatch(/function floorAtZero/);
    expect(extractFunction(src, "handleProtocolFeesWithdrawn")!).toMatch(
      /floorAtZero/
    );
    expect(extractFunction(src, "handlePoolCreatorFeesWithdrawn")!).toMatch(
      /floorAtZero/
    );
  });
});
