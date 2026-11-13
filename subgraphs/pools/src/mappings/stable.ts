import { Address, BigDecimal, BigInt, Bytes } from "@graphprotocol/graph-ts";

import { handlePoolCreated, PoolType } from "./common";
import { PoolCreated } from "../types/StablePoolFactory/BasePoolFactory";
import { StablePool } from "../types/StablePoolFactory/StablePool";
import { StableParams } from "../types/schema";
import { getFactoryVersion } from "../helpers/version";
import { StablePool as StablePoolTemplate } from "../types/templates";
import { setAmp } from "./amp";

function handleStablePoolParams(poolAddress: Address): Bytes {
  let stablePool = StablePool.bind(poolAddress);
  let ampResult = stablePool.try_getAmplificationParameter();
  let stableParams = new StableParams(poolAddress);
  stableParams.ampIsUpdating = false;
  stableParams.ampStartValue = BigDecimal.zero();
  stableParams.ampEndValue = BigDecimal.zero();
  stableParams.ampStartTime = BigInt.fromI32(0);
  stableParams.ampEndTime = BigInt.fromI32(0);
  setAmp(
    stableParams,
    ampResult.reverted ? BigInt.fromI32(0) : ampResult.value.value0
  );
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
