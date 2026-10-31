import { Address, BigInt, dataSource, ethereum } from "@graphprotocol/graph-ts";
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

/** Advance a ramp from the stored schedule. Natural completion emits no event. */
export function settleAmpRamp(stableParams: StableParams, now: BigInt): void {
  if (!stableParams.ampIsUpdating) return;

  if (now.ge(stableParams.ampEndTime)) {
    stableParams.amp = stableParams.ampEndValue;
    stableParams.ampIsUpdating = false;
    return;
  }

  if (now.le(stableParams.ampStartTime)) {
    stableParams.amp = stableParams.ampStartValue;
    return;
  }

  let duration = stableParams.ampEndTime.minus(stableParams.ampStartTime);
  if (duration.le(BigInt.fromI32(0))) {
    stableParams.amp = stableParams.ampEndValue;
    stableParams.ampIsUpdating = false;
    return;
  }

  let elapsed = now.minus(stableParams.ampStartTime);
  let delta = stableParams.ampEndValue.minus(stableParams.ampStartValue);
  stableParams.amp = stableParams.ampStartValue.plus(
    delta.times(elapsed).div(duration)
  );
}

export function handleBlock(block: ethereum.Block): void {
  let stableParams = StableParams.load(dataSource.address());
  if (!stableParams || !stableParams.ampIsUpdating) return;
  settleAmpRamp(stableParams, block.timestamp);
  stableParams.save();
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
  settleAmpRamp(stableParams, event.block.timestamp);
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
