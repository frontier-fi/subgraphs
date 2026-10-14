import { Address, BigDecimal, Bytes } from "@graphprotocol/graph-ts";

import { handlePoolCreated, PoolType } from "./common";
import { PoolCreated } from "../types/Gyro2CLPPoolFactory/BasePoolFactory";
import { Gyro2CLPPool } from "../types/Gyro2CLPPoolFactory/Gyro2CLPPool";
import { Gyro2Params } from "../types/schema";
import { scaleDown } from "../helpers/math";

function handleGyro2PoolParams(poolAddress: Address): Bytes {
  let gyro2Pool = Gyro2CLPPool.bind(poolAddress);
  let gyro2Result = gyro2Pool.try_getGyro2CLPPoolImmutableData();
  let gyro2Params = new Gyro2Params(poolAddress);
  if (!gyro2Result.reverted) {
    gyro2Params.sqrtAlpha = scaleDown(gyro2Result.value.sqrtAlpha, 18);
    gyro2Params.sqrtBeta = scaleDown(gyro2Result.value.sqrtBeta, 18);
  }
  gyro2Params.save();
  return gyro2Params.id;
}

export function handleGyro2PoolCreated(event: PoolCreated): void {
  handlePoolCreated(
    event.params.pool,
    event.address, // Factory
    PoolType.Gyro2,
    1,
    handleGyro2PoolParams,
    "gyro2Params"
  );
}
