import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";

import { handlePoolCreated, PoolType } from "./common";
import { PoolCreated } from "../types/StablePoolFactory/BasePoolFactory";
import { StablePool } from "../types/StablePoolFactory/StablePool";
import { StableParams } from "../types/schema";
import { getFactoryVersion } from "../helpers/version";
import { StablePool as StablePoolTemplate } from "../types/templates";

function handleStablePoolParams(poolAddress: Address): Bytes {
  let stablePool = StablePool.bind(poolAddress);
  let ampResult = stablePool.try_getAmplificationParameter();
  let stableParams = new StableParams(poolAddress);
  stableParams.ampIsUpdating = false;
  stableParams.ampStartValue = BigInt.fromI32(0);
  stableParams.ampEndValue = BigInt.fromI32(0);
  stableParams.ampStartTime = BigInt.fromI32(0);
  stableParams.ampEndTime = BigInt.fromI32(0);
  if (!ampResult.reverted) {
    let ampValue = ampResult.value.value0;
    let ampPrecision = ampResult.value.value2;
    stableParams.amp = ampValue.div(ampPrecision);
  } else {
    stableParams.amp = BigInt.fromI32(0);
  }
  stableParams.save();
  return stableParams.id;
}

export function handleStablePoolCreated(event: PoolCreated): void {
  let pool = StablePool.bind(event.params.pool);
  let versionCall = pool.try_version();
  let factoryVersion = versionCall.reverted
    ? 0
    : getFactoryVersion(versionCall.value);

  handlePoolCreated(
    event.params.pool,
    event.address, // Factory
    PoolType.Stable,
    factoryVersion,
    handleStablePoolParams,
    "stableParams"
  );

  StablePoolTemplate.create(event.params.pool);
}
