import { Address, BigInt } from "@graphprotocol/graph-ts";
import {
  AmpUpdateStarted,
  AmpUpdateStopped,
  StablePool,
} from "../types/templates/StablePool/StablePool";
import { StableParams } from "../types/schema";

function syncAmpFromPool(poolAddress: Address): void {
  let stablePool = StablePool.bind(poolAddress);
  let ampResult = stablePool.try_getAmplificationParameter();
  let stableParams = StableParams.load(poolAddress);
  if (!stableParams) {
    stableParams = new StableParams(poolAddress);
  }
  if (!ampResult.reverted) {
    let ampValue = ampResult.value.value0;
    let ampPrecision = ampResult.value.value2;
    stableParams.amp = ampValue.div(ampPrecision);
  } else {
    stableParams.amp = BigInt.fromI32(0);
  }
  stableParams.save();
}

export function handleAmpUpdateStarted(event: AmpUpdateStarted): void {
  syncAmpFromPool(event.address);
}

export function handleAmpUpdateStopped(event: AmpUpdateStopped): void {
  syncAmpFromPool(event.address);
}
