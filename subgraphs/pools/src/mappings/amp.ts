import { Address, BigInt } from "@graphprotocol/graph-ts";
import {
  AmpUpdateStarted,
  AmpUpdateStopped,
  StablePool,
} from "../types/templates/StablePool/StablePool";
import { StableParams } from "../types/schema";

function ensureStableParams(poolAddress: Address): StableParams {
  let stableParams = StableParams.load(poolAddress);
  if (!stableParams) {
    stableParams = new StableParams(poolAddress);
    stableParams.amp = BigInt.fromI32(0);
    stableParams.ampIsUpdating = false;
    stableParams.ampStartValue = BigInt.fromI32(0);
    stableParams.ampEndValue = BigInt.fromI32(0);
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
  // Event values are precision-scaled; store same units as `amp`.
  stableParams.ampStartValue = event.params.startValue.div(precision);
  stableParams.ampEndValue = event.params.endValue.div(precision);
  stableParams.ampStartTime = event.params.startTime;
  stableParams.ampEndTime = event.params.endTime;
  syncCurrentAmp(stableParams, event.address);
  stableParams.save();
}

export function handleAmpUpdateStopped(event: AmpUpdateStopped): void {
  let stableParams = ensureStableParams(event.address);
  stableParams.ampIsUpdating = false;
  stableParams.ampStartValue = BigInt.fromI32(0);
  stableParams.ampEndValue = BigInt.fromI32(0);
  stableParams.ampStartTime = BigInt.fromI32(0);
  stableParams.ampEndTime = BigInt.fromI32(0);
  syncCurrentAmp(stableParams, event.address);
  stableParams.save();
}
