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

function syncCurrentAmp(stableParams: StableParams, poolAddress: Address): void {
  let stablePool = StablePool.bind(poolAddress);
  let ampResult = stablePool.try_getAmplificationParameter();
  if (!ampResult.reverted) {
    let ampValue = ampResult.value.value0;
    let ampPrecision = ampResult.value.value2;
    stableParams.amp = ampValue.div(ampPrecision);
  }
}

export function handleAmpUpdateStarted(event: AmpUpdateStarted): void {
  let stableParams = ensureStableParams(event.address);
  stableParams.ampIsUpdating = true;
  stableParams.ampStartValue = event.params.startValue;
  stableParams.ampEndValue = event.params.endValue;
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
