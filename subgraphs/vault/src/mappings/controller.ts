import { getVault, loadPoolToken } from "../helpers/entities";
import { Pool } from "../types/schema";
import { scaleDown } from "../helpers/misc";
import {
  GlobalProtocolSwapFeePercentageChanged,
  GlobalProtocolYieldFeePercentageChanged,
  PoolCreatorSwapFeePercentageChanged,
  PoolCreatorYieldFeePercentageChanged,
  ProtocolFeesWithdrawn,
  ProtocolSwapFeeCollected,
  ProtocolSwapFeePercentageChanged,
  ProtocolYieldFeeCollected,
  ProtocolYieldFeePercentageChanged,
} from "../types/templates/ProtocolFeeController/ProtocolFeeController";
import { ZERO_BD } from "../helpers/constants";

export function handleGlobalProtocolSwapFeePercentageChanged(
  event: GlobalProtocolSwapFeePercentageChanged
): void {
  let vault = getVault();
  vault.protocolSwapFee = scaleDown(event.params.swapFeePercentage, 18);
  vault.save();
}

export function handleGlobalProtocolYieldFeePercentageChanged(
  event: GlobalProtocolYieldFeePercentageChanged
): void {
  let vault = getVault();
  vault.protocolYieldFee = scaleDown(event.params.yieldFeePercentage, 18);
  vault.save();
}

export function handlePoolCreatorSwapFeePercentageChanged(
  event: PoolCreatorSwapFeePercentageChanged
): void {
  let pool = Pool.load(event.params.pool) as Pool;
  pool.poolCreatorSwapFee = scaleDown(
    event.params.poolCreatorSwapFeePercentage,
    18
  );
  pool.save();
}

export function handlePoolCreatorYieldFeePercentageChanged(
  event: PoolCreatorYieldFeePercentageChanged
): void {
  let pool = Pool.load(event.params.pool) as Pool;
  pool.poolCreatorYieldFee = scaleDown(
    event.params.poolCreatorYieldFeePercentage,
    18
  );
  pool.save();
}

export function handleProtocolSwapFeePercentageChanged(
  event: ProtocolSwapFeePercentageChanged
): void {
  let pool = Pool.load(event.params.pool) as Pool;
  pool.protocolSwapFee = scaleDown(event.params.swapFeePercentage, 18);
  pool.save();
}

export function handleProtocolYieldFeePercentageChanged(
  event: ProtocolYieldFeePercentageChanged
): void {
  let pool = Pool.load(event.params.pool) as Pool;
  pool.protocolYieldFee = scaleDown(event.params.yieldFeePercentage, 18);
  pool.save();
}

export function handleProtocolSwapFeeCollected(
  event: ProtocolSwapFeeCollected
): void {
  let poolToken = loadPoolToken(event.params.pool, event.params.token);
  poolToken.vaultProtocolSwapFeeBalance = ZERO_BD;
  poolToken.controllerProtocolFeeBalance =
    poolToken.controllerProtocolFeeBalance.plus(
      scaleDown(event.params.amount, poolToken.decimals)
    );
  poolToken.save();
}

export function handleProtocolYieldFeeCollected(
  event: ProtocolYieldFeeCollected
): void {
  let poolToken = loadPoolToken(event.params.pool, event.params.token);
  poolToken.vaultProtocolYieldFeeBalance = ZERO_BD;
  poolToken.controllerProtocolFeeBalance =
    poolToken.controllerProtocolFeeBalance.plus(
      scaleDown(event.params.amount, poolToken.decimals)
    );
  poolToken.save();
}

export function handleProtocolFeesWithdrawn(
  event: ProtocolFeesWithdrawn
): void {
  let poolToken = loadPoolToken(event.params.pool, event.params.token);
  poolToken.controllerProtocolFeeBalance =
    poolToken.controllerProtocolFeeBalance.minus(
      scaleDown(event.params.amount, poolToken.decimals)
    );
  poolToken.save();
}
