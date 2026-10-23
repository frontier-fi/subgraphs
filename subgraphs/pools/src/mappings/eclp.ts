import { Address, Bytes, log } from "@graphprotocol/graph-ts";

import { createBasePool, PoolType } from "./common";
import { PoolCreated } from "../types/GyroECLPPoolFactory/BasePoolFactory";
import { GyroECLPPool } from "../types/GyroECLPPoolFactory/GyroECLPPool";
import { EclpParams } from "../types/schema";
import {
  EclpRawParams,
  derivedParamsAreConsistent,
  tauMatchesBounds,
  tauVectorsAreNormalized,
} from "../helpers/eclp";
import { scaleDown } from "../helpers/math";

/**
 * Reads the raw ECLP parameters, or null if the pool exposes neither reader. Newer pools expose the flat
 * getGyroECLPPoolImmutableData(); older versions only expose getECLPParams().
 */
function readEclpParams(poolAddress: Address): EclpRawParams | null {
  let pool = GyroECLPPool.bind(poolAddress);

  let immutableResult = pool.try_getGyroECLPPoolImmutableData();
  if (!immutableResult.reverted) {
    let d = immutableResult.value;
    return new EclpRawParams(
      d.paramsAlpha,
      d.paramsBeta,
      d.paramsC,
      d.paramsS,
      d.paramsLambda,
      d.tauAlphaX,
      d.tauAlphaY,
      d.tauBetaX,
      d.tauBetaY,
      d.u,
      d.v,
      d.w,
      d.z,
      d.dSq
    );
  }

  // Fallback for older pool versions that expose getECLPParams instead
  let eclpResult = pool.try_getECLPParams();
  if (!eclpResult.reverted) {
    let params = eclpResult.value.value0;
    let d = eclpResult.value.value1;
    return new EclpRawParams(
      params.alpha,
      params.beta,
      params.c,
      params.s,
      params.lambda,
      d.tauAlpha.x,
      d.tauAlpha.y,
      d.tauBeta.x,
      d.tauBeta.y,
      d.u,
      d.v,
      d.w,
      d.z,
      d.dSq
    );
  }

  return null;
}

function saveEclpParams(
  poolAddress: Address,
  raw: EclpRawParams | null
): Bytes {
  let eclpParams = new EclpParams(poolAddress);
  if (raw) {
    // Base params - 18 decimals
    eclpParams.alpha = scaleDown(raw.alpha, 18);
    eclpParams.beta = scaleDown(raw.beta, 18);
    eclpParams.c = scaleDown(raw.c, 18);
    eclpParams.s = scaleDown(raw.s, 18);
    eclpParams.lambda = scaleDown(raw.lambda, 18);

    // Derived params - 38 decimals
    eclpParams.tauAlphaX = scaleDown(raw.tauAlphaX, 38);
    eclpParams.tauAlphaY = scaleDown(raw.tauAlphaY, 38);
    eclpParams.tauBetaX = scaleDown(raw.tauBetaX, 38);
    eclpParams.tauBetaY = scaleDown(raw.tauBetaY, 38);
    eclpParams.u = scaleDown(raw.u, 38);
    eclpParams.v = scaleDown(raw.v, 38);
    eclpParams.w = scaleDown(raw.w, 38);
    eclpParams.z = scaleDown(raw.z, 38);
    eclpParams.dSq = scaleDown(raw.dSq, 38);
  }
  eclpParams.save();
  return eclpParams.id;
}

function createEclpPool(
  poolAddress: Address,
  factoryAddress: Address,
  version: i32
): void {
  let raw = readEclpParams(poolAddress);

  // The pool constructor checks only bounds on the derived params, never that they belong to the primary
  // params. A pool that fails either half of that missing check misprices against what it advertises, so
  // it is not indexed at all: no Pool, no EclpParams, and no Factory either, since getFactory only runs
  // once the checks have passed.
  if (raw) {
    let reason = "";
    if (!derivedParamsAreConsistent(raw)) {
      reason = "u, v, w, z and dSq are inconsistent with c, s, tauAlpha and tauBeta";
    } else if (!tauVectorsAreNormalized(raw)) {
      reason = "tauAlpha or tauBeta is not a unit vector";
    } else if (!tauMatchesBounds(raw)) {
      reason = "tauAlpha or tauBeta does not correspond to the pool's alpha and beta";
    }
    if (reason != "") {
      log.warning("ECLP pool {} not indexed: {}", [
        poolAddress.toHexString(),
        reason,
      ]);
      return;
    }
  }

  let pool = createBasePool(poolAddress, factoryAddress, PoolType.ECLP, version);
  pool.eclpParams = saveEclpParams(poolAddress, raw);
  pool.save();
}

export function handleEclpPoolCreated(event: PoolCreated): void {
  createEclpPool(
    event.params.pool,
    event.address, // Factory
    2
  );
}
