import {
  getVault,
  loadPoolToken,
  syncVaultAggregateSwapFeeFromChain,
} from "../helpers/entities";
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
  pool.aggregateSwapFee = pool.protocolSwapFee.plus(pool.poolCreatorSwapFee);
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
  pool.aggregateYieldFee = pool.protocolYieldFee.plus(pool.poolCreatorYieldFee);
  pool.save();
}

export function handleProtocolSwapFeePercentageChanged(
  event: ProtocolSwapFeePercentageChanged
): void {
  let pool = Pool.load(event.params.pool) as Pool;
  pool.protocolSwapFee = scaleDown(event.params.swapFeePercentage, 18);
  pool.aggregateSwapFee = pool.protocolSwapFee.plus(pool.poolCreatorSwapFee);
  pool.save();
}

export function handleProtocolYieldFeePercentageChanged(
  event: ProtocolYieldFeePercentageChanged
): void {
  let pool = Pool.load(event.params.pool) as Pool;
  pool.protocolYieldFee = scaleDown(event.params.yieldFeePercentage, 18);
  pool.aggregateYieldFee = pool.protocolYieldFee.plus(pool.poolCreatorYieldFee);
  pool.save();
}

export function handleProtocolSwapFeeCollected(
  event: ProtocolSwapFeeCollected
): void {
  let pool = Pool.load(event.params.pool) as Pool;
  let poolToken = loadPoolToken(event.params.pool, event.params.token);
  let amount = scaleDown(event.params.amount, poolToken.decimals);

  poolToken.vaultProtocolSwapFeeBalance =
    poolToken.vaultProtocolSwapFeeBalance.minus(amount);
  poolToken.controllerProtocolFeeBalance =
    poolToken.controllerProtocolFeeBalance.plus(amount);

  // collectAggregateFees also moves creator share out of the Vault without a
  // dedicated event — resync pending balances from chain.
  syncVaultAggregateSwapFeeFromChain(poolToken, pool);
  poolToken.save();
}

export function handleProtocolYieldFeeCollected(
  event: ProtocolYieldFeeCollected
): void {
  let pool = Pool.load(event.params.pool) as Pool;
  let poolToken = loadPoolToken(event.params.pool, event.params.token);
  let amount = scaleDown(event.params.amount, poolToken.decimals);

  poolToken.vaultProtocolYieldFeeBalance =
    poolToken.vaultProtocolYieldFeeBalance.minus(amount);
  poolToken.controllerProtocolFeeBalance =
    poolToken.controllerProtocolFeeBalance.plus(amount);

  // Move residual creator yield that left the vault into controller creator bal.
  let creatorPending = poolToken.vaultCreatorYieldFeeBalance;
  if (creatorPending.gt(ZERO_BD)) {
    poolToken.vaultCreatorYieldFeeBalance = ZERO_BD;
    poolToken.controllerCreatorFeeBalance =
      poolToken.controllerCreatorFeeBalance.plus(creatorPending);
  }
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
  if (event.params.isProtocolFeeExempt) {
    pool.aggregateSwapFee = ZERO_BD;
    pool.protocolSwapFee = ZERO_BD;
  } else {
    let aggregate = scaleDown(event.params.aggregateSwapFeePercentage, 18);
    pool.aggregateSwapFee = aggregate;
    // At init creator fee is typically 0; protocol = aggregate - creator.
    pool.protocolSwapFee = aggregate.minus(pool.poolCreatorSwapFee);
  }
  pool.save();
}

export function handleInitialPoolAggregateYieldFeePercentage(
  event: InitialPoolAggregateYieldFeePercentage
): void {
  let pool = Pool.load(event.params.pool);
  if (!pool) return;

  pool.protocolFeeExempt = event.params.isProtocolFeeExempt;
  if (event.params.isProtocolFeeExempt) {
    pool.aggregateYieldFee = ZERO_BD;
    pool.protocolYieldFee = ZERO_BD;
  } else {
    let aggregate = scaleDown(event.params.aggregateYieldFeePercentage, 18);
    pool.aggregateYieldFee = aggregate;
    pool.protocolYieldFee = aggregate.minus(pool.poolCreatorYieldFee);
  }
  pool.save();
}

export function handlePoolCreatorFeesWithdrawn(
  event: PoolCreatorFeesWithdrawn
): void {
  let poolToken = loadPoolToken(event.params.pool, event.params.token);
  poolToken.controllerCreatorFeeBalance =
    poolToken.controllerCreatorFeeBalance.minus(
      scaleDown(event.params.amount, poolToken.decimals)
    );
  poolToken.save();
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
    pool.aggregateSwapFee = ZERO_BD;
    pool.aggregateYieldFee = ZERO_BD;
  }
  pool.save();
}
