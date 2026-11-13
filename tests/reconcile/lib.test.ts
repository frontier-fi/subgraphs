import { describe, expect, it } from "vitest";
import { rawMatches, toRaw } from "../../scripts/reconcile/lib.mjs";

describe("toRaw", () => {
  it("scales a decimal string to raw units exactly", () => {
    expect(toRaw("1.5", 18)).toEqual({ raw: 1_500_000_000_000_000_000n, truncated: false });
    expect(toRaw("220", 6)).toEqual({ raw: 220_000_000n, truncated: false });
    expect(toRaw("0.000001", 6)).toEqual({ raw: 1n, truncated: false });
    expect(toRaw("0", 18)).toEqual({ raw: 0n, truncated: false });
  });

  it("truncates digits past the token's decimals and says so", () => {
    expect(toRaw("1.0000001", 6)).toEqual({ raw: 1_000_000n, truncated: true });
  });

  it("handles signs and exponent notation", () => {
    expect(toRaw("-2.5", 1)).toEqual({ raw: -25n, truncated: false });
    expect(toRaw("1e-12", 18)).toEqual({ raw: 1_000_000n, truncated: false });
    expect(toRaw("1.2E3", 0)).toEqual({ raw: 1200n, truncated: false });
  });
});

describe("rawMatches", () => {
  it("requires exact equality without a tolerance", () => {
    expect(rawMatches(10n, 10n)).toBe(true);
    expect(rawMatches(10n, 11n)).toBe(false);
  });

  it("accepts differences up to the tolerance in either direction", () => {
    expect(rawMatches(1000n, 1003n, 3n)).toBe(true);
    expect(rawMatches(1003n, 1000n, 3n)).toBe(true);
    expect(rawMatches(1000n, 1004n, 3n)).toBe(false);
  });
});
