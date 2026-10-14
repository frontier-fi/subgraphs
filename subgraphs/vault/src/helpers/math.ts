import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import { scaleUp } from "./misc";

const ONE = BigInt.fromString("1000000000000000000");

export function mulDown(a: BigInt, b: BigInt): BigInt {
  const product = a.times(b);

  return product.div(ONE);
}

export function mulDownSwapFee(
  swapFeeAmountRaw: BigInt,
  swapFeePercentage: BigDecimal
): BigInt {
  return mulDown(swapFeeAmountRaw, scaleUp(swapFeePercentage, 18));
}
