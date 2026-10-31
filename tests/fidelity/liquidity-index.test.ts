import { describe, expect, it } from "vitest";
import { extractFunction, readRepo } from "./helpers/source";

describe("Liquidity add/remove token index fidelity", () => {
  it("handleLiquidityAdded keys amounts and balances by poolToken.index", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/mappings/vault.ts"),
      "handleLiquidityAdded"
    )!;
    expect(body).toMatch(/getBalancesRaw\(\)\[poolToken\.index\]/);
    expect(body).not.toMatch(/getBalancesRaw\(\)\[i\]/);
    expect(body).toMatch(/amountsAddedRaw\[poolToken\.index\]/);
  });

  it("handleLiquidityRemoved keys amounts and balances by poolToken.index", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/mappings/vault.ts"),
      "handleLiquidityRemoved"
    )!;
    expect(body).toMatch(/getBalancesRaw\(\)\[poolToken\.index\]/);
    expect(body).not.toMatch(/getBalancesRaw\(\)\[i\]/);
    expect(body).toMatch(/amountsRemovedRaw\[poolToken\.index\]/);
  });

  it("handleSwap already uses poolToken index for balances", () => {
    const body = extractFunction(
      readRepo("subgraphs/vault/src/mappings/vault.ts"),
      "handleSwap"
    )!;
    expect(body).toMatch(/getBalancesRaw\(\)\[poolTokenIn\.index\]/);
    expect(body).toMatch(/getBalancesRaw\(\)\[poolTokenOut\.index\]/);
  });

  it("shuffled derivedFrom order must not remap amounts when using index", () => {
    const amounts = [100n, 200n, 300n];
    const shuffled = [
      { index: 2, symbol: "C" },
      { index: 0, symbol: "A" },
      { index: 1, symbol: "B" },
    ];
    const byIndex = shuffled.map((t) => ({
      symbol: t.symbol,
      amount: amounts[t.index]!,
    }));
    expect(byIndex.find((x) => x.symbol === "A")!.amount).toBe(100n);
    expect(byIndex.find((x) => x.symbol === "B")!.amount).toBe(200n);
    expect(byIndex.find((x) => x.symbol === "C")!.amount).toBe(300n);
  });
});
