import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import {
  AmpUpdateStarted,
  AmpUpdateStopped,
  StablePool,
} from "../types/templates/StablePool/StablePool";
import { Pool, StableParams } from "../types/schema";

function ensureStableParams(poolAddress: Address): StableParams {
  let stableParams = StableParams.load(poolAddress);
  if (!stableParams) {
    stableParams = new StableParams(poolAddress);
    stableParams.amp = BigInt.fromI32(0);
    stableParams.ampIsUpdating = false;
    stableParams.ampStartValue = BigDecimal.zero();
    stableParams.ampEndValue = BigDecimal.zero();
    stableParams.ampStartTime = BigInt.fromI32(0);
    stableParams.ampEndTime = BigInt.fromI32(0);
  }
  return stableParams;
}

function ampPrecision(poolAddress: Address): BigInt {
  let stablePool = StablePool.bind(poolAddress);
  let ampResult = stablePool.try_getAmplificationParameter();
  if (!ampResult.reverted) {
    return ampResult.value.value2;
  }
  // StablePool AMP_PRECISION is 1e3 when the view is unavailable.
  return BigInt.fromI32(1000);
}

function touchPool(poolAddress: Address): void {
  let pool = Pool.load(poolAddress);
  if (pool) pool.save();
}

function syncCurrentAmp(stableParams: StableParams, poolAddress: Address): void {
  let stablePool = StablePool.bind(poolAddress);
  let ampResult = stablePool.try_getAmplificationParameter();
  if (!ampResult.reverted) {
    let ampValue = ampResult.value.value0;
    let precision = ampResult.value.value2;
    stableParams.amp = ampValue.div(precision);
  }
}

export function handleAmpUpdateStarted(event: AmpUpdateStarted): void {
  let stableParams = ensureStableParams(event.address);
  let precision = ampPrecision(event.address);
  stableParams.ampIsUpdating = true;
  // Event values are precision-scaled; keep fractional amps (150500 -> 150.5).
  stableParams.ampStartValue = event.params.startValue.divDecimal(
    precision.toBigDecimal()
  );
  stableParams.ampEndValue = event.params.endValue.divDecimal(
    precision.toBigDecimal()
  );
  stableParams.ampStartTime = event.params.startTime;
  stableParams.ampEndTime = event.params.endTime;
  syncCurrentAmp(stableParams, event.address);
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
  syncCurrentAmp(stableParams, event.address);
  stableParams.save();
  touchPool(event.address);
}
