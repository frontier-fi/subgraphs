/**
 * TypeScript port of subgraphs/pools/src/helpers/eclp.ts for fidelity tests.
 * Keep tolerances and formulas in sync with the AssemblyScript source.
 */

export type EclpRawParams = {
  alpha: bigint;
  beta: bigint;
  c: bigint;
  s: bigint;
  lambda: bigint;
  tauAlphaX: bigint;
  tauAlphaY: bigint;
  tauBetaX: bigint;
  tauBetaY: bigint;
  u: bigint;
  v: bigint;
  w: bigint;
  z: bigint;
  dSq: bigint;
};

const E36 = 10n ** 36n;
const ONE_XP = 10n ** 38n;
const DERIVED_TOL_XP = 10n ** 24n;
const E18 = 10n ** 18n;
const TAU_TOL_INV = 10n ** 14n;
const NORM_TOL_INV = 10n ** 12n;
const ONE_XP_SQ = ONE_XP * ONE_XP;

function abs(n: bigint): bigint {
  return n < 0n ? -n : n;
}

function toXp(n: bigint): bigint {
  const q = abs(n) / E36;
  return n < 0n ? -q : q;
}

function matches(stored: bigint, expected: bigint): boolean {
  return abs(stored - expected) <= DERIVED_TOL_XP;
}

export function derivedParamsAreConsistent(p: EclpRawParams): boolean {
  const cs = p.c * p.s;
  const cc = p.c * p.c;
  const ss = p.s * p.s;

  return (
    matches(p.u, toXp(cs * (p.tauBetaX - p.tauAlphaX))) &&
    matches(p.v, toXp(ss * p.tauBetaY + cc * p.tauAlphaY)) &&
    matches(p.w, toXp(cs * (p.tauBetaY - p.tauAlphaY))) &&
    matches(p.z, toXp(cc * p.tauBetaX + ss * p.tauAlphaX)) &&
    matches(p.dSq, toXp((cc + ss) * ONE_XP))
  );
}

function matchesRelative(a: bigint, b: bigint, tolInverse: bigint): boolean {
  let scale = abs(a);
  const bAbs = abs(b);
  if (bAbs > scale) scale = bAbs;
  return abs(a - b) <= scale / tolInverse;
}

function tauMatchesBound(
  p: EclpRawParams,
  px: bigint,
  tauX: bigint,
  tauY: bigint
): boolean {
  const lhs = tauX * E18 * (p.c * E18 + p.s * px);
  const rhs = tauY * p.lambda * (p.c * px - p.s * E18);
  return matchesRelative(lhs, rhs, TAU_TOL_INV);
}

export function tauMatchesBounds(p: EclpRawParams): boolean {
  return (
    tauMatchesBound(p, p.alpha, p.tauAlphaX, p.tauAlphaY) &&
    tauMatchesBound(p, p.beta, p.tauBetaX, p.tauBetaY)
  );
}

export function tauVectorsAreNormalized(p: EclpRawParams): boolean {
  return (
    matchesRelative(
      p.tauAlphaX * p.tauAlphaX + p.tauAlphaY * p.tauAlphaY,
      ONE_XP_SQ,
      NORM_TOL_INV
    ) &&
    matchesRelative(
      p.tauBetaX * p.tauBetaX + p.tauBetaY * p.tauBetaY,
      ONE_XP_SQ,
      NORM_TOL_INV
    )
  );
}

/** Build derived u,v,w,z,dSq from primary + tau (honest generator). */
export function expectedDerived(
  c: bigint,
  s: bigint,
  tauAlphaX: bigint,
  tauAlphaY: bigint,
  tauBetaX: bigint,
  tauBetaY: bigint
): Pick<EclpRawParams, "u" | "v" | "w" | "z" | "dSq"> {
  const cs = c * s;
  const cc = c * c;
  const ss = s * s;
  return {
    u: toXp(cs * (tauBetaX - tauAlphaX)),
    v: toXp(ss * tauBetaY + cc * tauAlphaY),
    w: toXp(cs * (tauBetaY - tauAlphaY)),
    z: toXp(cc * tauBetaX + ss * tauAlphaX),
    dSq: toXp((cc + ss) * ONE_XP),
  };
}
