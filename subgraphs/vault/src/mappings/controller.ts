import { getVault, loadPoolToken } from "../helpers/entities";
import { Pool } from "../types/schema";
import { scaleDown } from "../helpers/misc";
import {
  GlobalProtocolSwapFeePercentageChanged,
  GlobalProtocolYieldFeePercentageChanged,
  InitialPoolAggregateSwapFeePercentage,
  InitialPoolAggregateYieldFeePercentage,
  PoolCreatorFeesWithdrawn,
  PoolCreatorSwapFeePercentageChanged,
  PoolCreatorYieldFeePercentageChanged,
  PoolRegisteredWithFeeController,
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
  let amount = scaleDown(event.params.amount, poolToken.decimals);
  poolToken.vaultProtocolSwapFeeBalance =
    poolToken.vaultProtocolSwapFeeBalance.minus(amount);
  poolToken.controllerProtocolFeeBalance =
    poolToken.controllerProtocolFeeBalance.plus(amount);
  poolToken.save();
}

export function handleProtocolYieldFeeCollected(
  event: ProtocolYieldFeeCollected
): void {
  let poolToken = loadPoolToken(event.params.pool, event.params.token);
  let amount = scaleDown(event.params.amount, poolToken.decimals);
  poolToken.vaultProtocolYieldFeeBalance =
    poolToken.vaultProtocolYieldFeeBalance.minus(amount);
  poolToken.controllerProtocolFeeBalance =
    poolToken.controllerProtocolFeeBalance.plus(amount);
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

export function handleInitialPoolAggregateSwapFeePercentage(
  event: InitialPoolAggregateSwapFeePercentage
): void {
  let pool = Pool.load(event.params.pool);
  if (!pool) return;

  pool.protocolFeeExempt = event.params.isProtocolFeeExempt;
  // At registration creator fee is typically 0, so aggregate == protocol.
  pool.protocolSwapFee = event.params.isProtocolFeeExempt
    ? ZERO_BD
    : scaleDown(event.params.aggregateSwapFeePercentage, 18);
  pool.save();
}

export function handleInitialPoolAggregateYieldFeePercentage(
  event: InitialPoolAggregateYieldFeePercentage
): void {
  let pool = Pool.load(event.params.pool);
  if (!pool) return;

  pool.protocolFeeExempt = event.params.isProtocolFeeExempt;
  pool.protocolYieldFee = event.params.isProtocolFeeExempt
    ? ZERO_BD
    : scaleDown(event.params.aggregateYieldFeePercentage, 18);
  pool.save();
}

export function handlePoolCreatorFeesWithdrawn(
  event: PoolCreatorFeesWithdrawn
): void {
  // Creator fee balances are not tracked separately from protocol controller
  // balances today; acknowledge the event for indexing completeness.
  let pool = Pool.load(event.params.pool);
  if (!pool) return;
  pool.save();
}

export function handlePoolRegisteredWithFeeController(
  event: PoolRegisteredWithFeeController
): void {
  let pool = Pool.load(event.params.pool);
  if (!pool) return;

  pool.poolCreator = event.params.poolCreator;
  pool.protocolFeeExempt = event.params.protocolFeeExempt;
  if (event.params.protocolFeeExempt) {
    pool.protocolSwapFee = ZERO_BD;
    pool.protocolYieldFee = ZERO_BD;
  }
  pool.save();
}
