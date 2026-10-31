import { describe, expect, it } from "vitest";
import {
  derivedParamsAreConsistent,
  expectedDerived,
  tauVectorsAreNormalized,
  type EclpRawParams,
} from "./helpers/eclp";
import { readRepo } from "./helpers/source";

const E18 = 10n ** 18n;
const ONE_XP = 10n ** 38n;

function honestSynthetic(): EclpRawParams {
  const c = E18;
  const s = 0n;
  const tauAlphaX = 0n;
  const tauAlphaY = ONE_XP;
  const tauBetaX = 0n;
  const tauBetaY = ONE_XP;
  const derived = expectedDerived(c, s, tauAlphaX, tauAlphaY, tauBetaX, tauBetaY);
  return {
    alpha: E18 / 2n,
    beta: (3n * E18) / 2n,
    c,
    s,
    lambda: E18,
    tauAlphaX,
    tauAlphaY,
    tauBetaX,
    tauBetaY,
    ...derived,
  };
}

describe("ECLP helper math (pools/src/helpers/eclp.ts)", () => {
  it("exports the three consistency checks", () => {
    const src = readRepo("subgraphs/pools/src/helpers/eclp.ts");
    expect(src).toMatch(/export function derivedParamsAreConsistent/);
    expect(src).toMatch(/export function tauMatchesBounds/);
    expect(src).toMatch(/export function tauVectorsAreNormalized/);
  });

  it("accepts an algebraically consistent derived set", () => {
    expect(derivedParamsAreConsistent(honestSynthetic())).toBe(true);
  });

  it("rejects flipped-sign z", () => {
    const good = honestSynthetic();
    const bad: EclpRawParams = {
      ...good,
      z: good.z === 0n ? -(10n ** 30n) : -good.z,
    };
    expect(derivedParamsAreConsistent(bad)).toBe(false);
  });

  it("rejects non-unit tau vectors", () => {
    const p = honestSynthetic();
    p.tauAlphaX = ONE_XP;
    p.tauAlphaY = ONE_XP;
    expect(tauVectorsAreNormalized(p)).toBe(false);
  });

  it("mapping wires all three checks before indexing", () => {
    const mapping = readRepo("subgraphs/pools/src/mappings/eclp.ts");
    expect(mapping).toMatch(/derivedParamsAreConsistent/);
    expect(mapping).toMatch(/tauVectorsAreNormalized/);
    expect(mapping).toMatch(/tauMatchesBounds/);
  });
});
