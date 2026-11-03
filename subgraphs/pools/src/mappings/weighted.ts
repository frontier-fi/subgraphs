import { Address, BigDecimal, Bytes } from "@graphprotocol/graph-ts";

import { handlePoolCreated, PoolType } from "./common";
import { PoolCreated } from "../types/WeightedPoolFactory/BasePoolFactory";
import { WeightedPool } from "../types/WeightedPoolFactory/WeightedPool";
import { WeightedParams } from "../types/schema";
import { scaleDown } from "../helpers/math";
import { getFactoryVersion } from "../helpers/version";

function handleWeightedPoolParams(poolAddress: Address): Bytes {
  let weightedPool = WeightedPool.bind(poolAddress);
  let weightsResult = weightedPool.try_getNormalizedWeights();
  let weightedParams = new WeightedParams(poolAddress);
  if (!weightsResult.reverted) {
    weightedParams.weights = weightsResult.value.map<BigDecimal>((weight) =>
      scaleDown(weight, 18)
    );
  }
  weightedParams.save();
  return weightedParams.id;
}

export function handleWeightedPoolCreated(event: PoolCreated): void {
  let pool = WeightedPool.bind(event.params.pool);
  let versionCall = pool.try_version();
  let factoryVersion = versionCall.reverted
    ? 0
    : getFactoryVersion(versionCall.value);

  handlePoolCreated(
    event.params.pool,
    event.address, // Factory
    PoolType.Weighted,
    factoryVersion,
    handleWeightedPoolParams,
    "weightedParams"
  );
}
