import { BigInt } from "@graphprotocol/graph-ts";
import { ZERO_ADDRESS, ZERO_BD, ZERO_BI } from "../helpers/constants";
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

  let poolShareFrom = getPoolShare(poolAddress, event.params.from);
  let poolShareFromBalance =
    poolShareFrom == null ? ZERO_BD : poolShareFrom.balance;

  let poolShareTo = getPoolShare(poolAddress, event.params.to);
  let poolShareToBalance = poolShareTo == null ? ZERO_BD : poolShareTo.balance;

  let pool = Pool.load(event.address) as Pool;

  let BPT_DECIMALS = 18;

  if (isMint) {
    poolShareTo.balance = poolShareTo.balance.plus(
      tokenToDecimal(event.params.value, BPT_DECIMALS)
    );
    poolShareTo.save();
    pool.totalShares = pool.totalShares.plus(
      tokenToDecimal(event.params.value, BPT_DECIMALS)
    );
  } else if (isBurn) {
    poolShareFrom.balance = poolShareFrom.balance.minus(
      tokenToDecimal(event.params.value, BPT_DECIMALS)
    );
    poolShareFrom.save();
    pool.totalShares = pool.totalShares.minus(
      tokenToDecimal(event.params.value, BPT_DECIMALS)
    );
  } else {
    poolShareTo.balance = poolShareTo.balance.plus(
      tokenToDecimal(event.params.value, BPT_DECIMALS)
    );
    poolShareTo.save();

    poolShareFrom.balance = poolShareFrom.balance.minus(
      tokenToDecimal(event.params.value, BPT_DECIMALS)
    );
    poolShareFrom.save();
  }

  if (
    poolShareTo !== null &&
    poolShareTo.balance.notEqual(ZERO_BD) &&
    poolShareToBalance.equals(ZERO_BD)
  ) {
    pool.holdersCount = pool.holdersCount.plus(BigInt.fromI32(1));
  }

  if (
    poolShareFrom !== null &&
    poolShareFrom.balance.equals(ZERO_BD) &&
    poolShareFromBalance.notEqual(ZERO_BD)
  ) {
    pool.holdersCount = pool.holdersCount.minus(BigInt.fromI32(1));
  }

  pool.save();
}
