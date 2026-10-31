import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import { scaleUp } from "./misc";

const ONE = BigInt.fromString("1000000000000000000");
// Vault aggregate fees are truncated to 24-bit precision (1e18 / 1e11).
const FEE_SCALING_FACTOR = BigInt.fromI32(10).pow(11);

export function mulDown(a: BigInt, b: BigInt): BigInt {
  const product = a.times(b);

  return product.div(ONE);
}

/**
 * protocol + (1 - protocol) * creator, then truncated to the Vault's 24-bit fee precision.
 * Creator fee applies only to the remainder after the protocol cut.
 */
export function computeAggregateFeePercentageRaw(
  protocolFeeRaw: BigInt,
  poolCreatorFeeRaw: BigInt
): BigInt {
  let creatorOnRemainder = ONE.minus(protocolFeeRaw)
    .times(poolCreatorFeeRaw)
    .div(ONE);
  let aggregate = protocolFeeRaw.plus(creatorOnRemainder);
  return aggregate.div(FEE_SCALING_FACTOR).times(FEE_SCALING_FACTOR);
}

export function mulDownSwapFee(
  swapFeeAmountRaw: BigInt,
  swapFeePercentage: BigDecimal
): BigInt {
  return mulDown(swapFeeAmountRaw, scaleUp(swapFeePercentage, 18));
}
