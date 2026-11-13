import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import {
  AmpUpdateStarted,
  AmpUpdateStopped,
} from "../types/templates/StablePool/StablePool";
import { Pool, StableParams } from "../types/schema";

// StableMath.AMP_PRECISION in the deployed StablePool (balancer-v3-monorepo 25d73b3d).
export const AMP_PRECISION = BigInt.fromI32(1000);

function ensureStableParams(poolAddress: Address): StableParams {
  let stableParams = StableParams.load(poolAddress);
  if (!stableParams) {
    stableParams = new StableParams(poolAddress);
    stableParams.amp = BigInt.fromI32(0);
    stableParams.ampRaw = BigInt.fromI32(0);
    stableParams.ampIsUpdating = false;
    stableParams.ampStartValue = BigDecimal.zero();
    stableParams.ampEndValue = BigDecimal.zero();
    stableParams.ampStartTime = BigInt.fromI32(0);
    stableParams.ampEndTime = BigInt.fromI32(0);
  }
  return stableParams;
}

function touchPool(poolAddress: Address): void {
  let pool = Pool.load(poolAddress);
  if (pool) pool.save();
}

/** Store the current amp, precision-scaled as the pool reports it. */
export function setAmp(stableParams: StableParams, ampRaw: BigInt): void {
  stableParams.ampRaw = ampRaw;
  stableParams.amp = ampRaw.div(AMP_PRECISION);
}

export function handleAmpUpdateStarted(event: AmpUpdateStarted): void {
  let stableParams = ensureStableParams(event.address);
  stableParams.ampIsUpdating = true;
  // Event values are precision-scaled; keep fractional amps (150500 -> 150.5).
  let precision = AMP_PRECISION.toBigDecimal();
  stableParams.ampStartValue = event.params.startValue.divDecimal(precision);
  stableParams.ampEndValue = event.params.endValue.divDecimal(precision);
  stableParams.ampStartTime = event.params.startTime;
  stableParams.ampEndTime = event.params.endTime;
  // A ramp starts now from the current value, so startValue is the amp at this block.
  setAmp(stableParams, event.params.startValue);
  stableParams.save();
  touchPool(event.address);
}

export function handleAmpUpdateStopped(event: AmpUpdateStopped): void {
  let stableParams = ensureStableParams(event.address);
  stableParams.ampIsUpdating = false;
  stableParams.ampStartValue = BigDecimal.zero();
  stableParams.ampEndValue = BigDecimal.zero();
  stableParams.ampStartTime = BigInt.fromI32(0);
  stableParams.ampEndTime = BigInt.fromI32(0);
  setAmp(stableParams, event.params.currentValue);
  stableParams.save();
  touchPool(event.address);
}
