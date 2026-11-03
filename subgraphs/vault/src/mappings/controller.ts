import { BigDecimal, Bytes, store } from "@graphprotocol/graph-ts";
import {
  getVault,
  loadPoolToken,
  splitAggregateAmount,
} from "../helpers/entities";
import { PendingPoolFeeInit, Pool, PoolToken } from "../types/schema";
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
import { ZERO_ADDRESS, ZERO_BD } from "../helpers/constants";

function floorAtZero(balance: BigDecimal, amount: BigDecimal): BigDecimal {
  let next = balance.minus(amount);
  if (next.lt(ZERO_BD)) return ZERO_BD;
  return next;
}

function ensurePending(poolAddress: Bytes): PendingPoolFeeInit {
  let pending = PendingPoolFeeInit.load(poolAddress);
  if (pending) return pending;

  pending = new PendingPoolFeeInit(poolAddress);
  pending.hasRegistration = false;
  pending.poolCreator = ZERO_ADDRESS;
  pending.protocolFeeExempt = false;
  pending.hasSwapAggregate = false;
  pending.aggregateSwapFee = ZERO_BD;
  pending.swapFeeExempt = false;
  pending.hasYieldAggregate = false;
  pending.aggregateYieldFee = ZERO_BD;
  pending.yieldFeeExempt = false;
  return pending;
}

/**
 * Fee-controller registration logs are emitted before Vault PoolRegistered.
 * Stash them and apply once the Pool entity exists.
 */
export function applyPendingPoolFeeInit(pool: Pool): void {
  let pending = PendingPoolFeeInit.load(pool.id);
  if (!pending) return;

  if (pending.hasRegistration) {
    pool.poolCreator = pending.poolCreator;
    pool.protocolFeeExempt = pending.protocolFeeExempt;
  }
  if (pending.hasSwapAggregate) {
    pool.aggregateSwapFee = pending.aggregateSwapFee;
    pool.protocolFeeExempt = pending.swapFeeExempt;
    // At registration the creator fee is zero, so protocol equals the aggregate.
    pool.protocolSwapFee = pending.swapFeeExempt
      ? ZERO_BD
      : pending.aggregateSwapFee;
  }
  if (pending.hasYieldAggregate) {
    pool.aggregateYieldFee = pending.aggregateYieldFee;
    pool.protocolFeeExempt = pending.yieldFeeExempt;
    pool.protocolYieldFee = pending.yieldFeeExempt
      ? ZERO_BD
      : pending.aggregateYieldFee;
  }
  if (pool.protocolFeeExempt) {
    pool.protocolSwapFee = ZERO_BD;
    pool.protocolYieldFee = ZERO_BD;
    pool.aggregateSwapFee = ZERO_BD;
    pool.aggregateYieldFee = ZERO_BD;
  }
  pool.save();
  store.remove("PendingPoolFeeInit", pending.id.toHexString());
}

function applyCollected(
  pool: Pool,
  poolToken: PoolToken,
  amount: BigDecimal,
  isSwap: boolean
): void {
  let protocolPct = isSwap ? pool.protocolSwapFee : pool.protocolYieldFee;
  let creatorPct = isSwap ? pool.poolCreatorSwapFee : pool.poolCreatorYieldFee;
  // Event amount is the full aggregate taken from the Vault, not the protocol cut.
  let parts = splitAggregateAmount(amount, protocolPct, creatorPct);

  // Vault collectAggregateFees zeroes both swap and yield pending for a token
  // when either is non-zero, but the controller only emits an event for the
  // non-zero side. Clear both here.
  poolToken.vaultProtocolSwapFeeBalance = ZERO_BD;
  poolToken.vaultCreatorSwapFeeBalance = ZERO_BD;
  poolToken.vaultProtocolYieldFeeBalance = ZERO_BD;
  poolToken.vaultCreatorYieldFeeBalance = ZERO_BD;

  poolToken.controllerProtocolFeeBalance =
    poolToken.controllerProtocolFeeBalance.plus(parts[0]);
  poolToken.controllerCreatorFeeBalance =
    poolToken.controllerCreatorFeeBalance.plus(parts[1]);
  poolToken.save();
}

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
  let pool = Pool.load(event.params.pool);
  if (!pool) return;
  pool.poolCreatorSwapFee = scaleDown(
    event.params.poolCreatorSwapFeePercentage,
    18
  );
  // aggregateSwapFee comes from the Vault's AggregateSwapFeePercentageChanged,
  // which the controller triggers just before this event.
  pool.save();
}

export function handlePoolCreatorYieldFeePercentageChanged(
  event: PoolCreatorYieldFeePercentageChanged
): void {
  let pool = Pool.load(event.params.pool);
  if (!pool) return;
  pool.poolCreatorYieldFee = scaleDown(
    event.params.poolCreatorYieldFeePercentage,
    18
  );
  // aggregateYieldFee comes from the Vault's AggregateYieldFeePercentageChanged.
  pool.save();
}

export function handleProtocolSwapFeePercentageChanged(
  event: ProtocolSwapFeePercentageChanged
): void {
  let pool = Pool.load(event.params.pool);
  if (!pool) return;
  pool.protocolSwapFee = scaleDown(event.params.swapFeePercentage, 18);
  pool.save();
}

export function handleProtocolYieldFeePercentageChanged(
  event: ProtocolYieldFeePercentageChanged
): void {
  let pool = Pool.load(event.params.pool);
  if (!pool) return;
  pool.protocolYieldFee = scaleDown(event.params.yieldFeePercentage, 18);
  pool.save();
}

export function handleProtocolSwapFeeCollected(
  event: ProtocolSwapFeeCollected
): void {
  let pool = Pool.load(event.params.pool);
  if (!pool) return;
  let poolToken = loadPoolToken(event.params.pool, event.params.token);
  let amount = scaleDown(event.params.amount, poolToken.decimals);
  applyCollected(pool, poolToken, amount, true);
}

export function handleProtocolYieldFeeCollected(
  event: ProtocolYieldFeeCollected
): void {
  let pool = Pool.load(event.params.pool);
  if (!pool) return;
  let poolToken = loadPoolToken(event.params.pool, event.params.token);
  let amount = scaleDown(event.params.amount, poolToken.decimals);
  applyCollected(pool, poolToken, amount, false);
}

export function handleProtocolFeesWithdrawn(
  event: ProtocolFeesWithdrawn
): void {
  let poolToken = loadPoolToken(event.params.pool, event.params.token);
  poolToken.controllerProtocolFeeBalance = floorAtZero(
    poolToken.controllerProtocolFeeBalance,
    scaleDown(event.params.amount, poolToken.decimals)
  );
  poolToken.save();
}

export function handleInitialPoolAggregateSwapFeePercentage(
  event: InitialPoolAggregateSwapFeePercentage
): void {
  let aggregate = scaleDown(event.params.aggregateSwapFeePercentage, 18);
  let pool = Pool.load(event.params.pool);
  if (!pool) {
    let pending = ensurePending(event.params.pool);
    pending.hasSwapAggregate = true;
    pending.aggregateSwapFee = aggregate;
    pending.swapFeeExempt = event.params.isProtocolFeeExempt;
    pending.protocolFeeExempt = event.params.isProtocolFeeExempt;
    pending.save();
    return;
  }

  pool.protocolFeeExempt = event.params.isProtocolFeeExempt;
  pool.aggregateSwapFee = event.params.isProtocolFeeExempt ? ZERO_BD : aggregate;
  pool.protocolSwapFee = event.params.isProtocolFeeExempt ? ZERO_BD : aggregate;
  pool.save();
}

export function handleInitialPoolAggregateYieldFeePercentage(
  event: InitialPoolAggregateYieldFeePercentage
): void {
  let aggregate = scaleDown(event.params.aggregateYieldFeePercentage, 18);
  let pool = Pool.load(event.params.pool);
  if (!pool) {
    let pending = ensurePending(event.params.pool);
    pending.hasYieldAggregate = true;
    pending.aggregateYieldFee = aggregate;
    pending.yieldFeeExempt = event.params.isProtocolFeeExempt;
    pending.protocolFeeExempt = event.params.isProtocolFeeExempt;
    pending.save();
    return;
  }

  pool.protocolFeeExempt = event.params.isProtocolFeeExempt;
  pool.aggregateYieldFee = event.params.isProtocolFeeExempt ? ZERO_BD : aggregate;
  pool.protocolYieldFee = event.params.isProtocolFeeExempt ? ZERO_BD : aggregate;
  pool.save();
}

export function handlePoolCreatorFeesWithdrawn(
  event: PoolCreatorFeesWithdrawn
): void {
  let poolToken = loadPoolToken(event.params.pool, event.params.token);
  poolToken.controllerCreatorFeeBalance = floorAtZero(
    poolToken.controllerCreatorFeeBalance,
    scaleDown(event.params.amount, poolToken.decimals)
  );
  poolToken.save();
}

export function handlePoolRegisteredWithFeeController(
  event: PoolRegisteredWithFeeController
): void {
  let pool = Pool.load(event.params.pool);
  if (!pool) {
    let pending = ensurePending(event.params.pool);
    pending.hasRegistration = true;
    pending.poolCreator = event.params.poolCreator;
    pending.protocolFeeExempt = event.params.protocolFeeExempt;
    pending.save();
    return;
  }

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
