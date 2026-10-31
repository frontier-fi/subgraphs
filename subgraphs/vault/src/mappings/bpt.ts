import { BigInt } from "@graphprotocol/graph-ts";
import { ZERO_ADDRESS, ZERO_BD } from "../helpers/constants";
import { getPoolShare } from "../helpers/entities";
import { tokenToDecimal } from "../helpers/misc";
import { Transfer as TransferEvent } from "../types/templates/BPT/BPT";
import { Pool } from "../types/schema";

/************************************
 ********** BPTS TRANSFERS **********
 ************************************/

export function handleTransfer(event: TransferEvent): void {
  let isMint = event.params.from == ZERO_ADDRESS;
  let isBurn = event.params.to == ZERO_ADDRESS;

  const poolAddress = event.address;
  let pool = Pool.load(event.address) as Pool;
  let BPT_DECIMALS = 18;
  let amount = tokenToDecimal(event.params.value, BPT_DECIMALS);

  if (isMint) {
    // Do not create a PoolShare for the zero address.
    let poolShareTo = getPoolShare(poolAddress, event.params.to);
    let balanceBefore = poolShareTo.balance;
    poolShareTo.balance = poolShareTo.balance.plus(amount);
    poolShareTo.save();
    pool.totalShares = pool.totalShares.plus(amount);

    if (
      event.params.to != ZERO_ADDRESS &&
      balanceBefore.equals(ZERO_BD) &&
      poolShareTo.balance.gt(ZERO_BD)
    ) {
      pool.holdersCount = pool.holdersCount.plus(BigInt.fromI32(1));
    }
  } else if (isBurn) {
    let poolShareFrom = getPoolShare(poolAddress, event.params.from);
    let balanceBefore = poolShareFrom.balance;
    poolShareFrom.balance = poolShareFrom.balance.minus(amount);
    // Clamp underflow / BigDecimal dust so holdersCount can decrement.
    if (poolShareFrom.balance.le(ZERO_BD)) {
      poolShareFrom.balance = ZERO_BD;
    }
    poolShareFrom.save();
    pool.totalShares = pool.totalShares.minus(amount);

    if (
      event.params.from != ZERO_ADDRESS &&
      balanceBefore.gt(ZERO_BD) &&
      poolShareFrom.balance.equals(ZERO_BD)
    ) {
      pool.holdersCount = pool.holdersCount.minus(BigInt.fromI32(1));
    }
  } else if (event.params.from == event.params.to) {
    // Self-transfer does not change balances or holder count.
  } else {
    let poolShareTo = getPoolShare(poolAddress, event.params.to);
    let poolShareFrom = getPoolShare(poolAddress, event.params.from);
    let balanceToBefore = poolShareTo.balance;
    let balanceFromBefore = poolShareFrom.balance;

    poolShareTo.balance = poolShareTo.balance.plus(amount);
    poolShareTo.save();

    poolShareFrom.balance = poolShareFrom.balance.minus(amount);
    if (poolShareFrom.balance.le(ZERO_BD)) {
      poolShareFrom.balance = ZERO_BD;
    }
    poolShareFrom.save();

    if (balanceToBefore.equals(ZERO_BD) && poolShareTo.balance.gt(ZERO_BD)) {
      pool.holdersCount = pool.holdersCount.plus(BigInt.fromI32(1));
    }
    if (
      balanceFromBefore.gt(ZERO_BD) &&
      poolShareFrom.balance.equals(ZERO_BD)
    ) {
      pool.holdersCount = pool.holdersCount.minus(BigInt.fromI32(1));
    }
  }

  pool.save();
}
