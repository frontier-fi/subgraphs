import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";

export function hexToBigInt(hex: string): BigInt {
  let hexUpper = hex.toUpperCase();
  let bigInt = BigInt.fromI32(0);
  let power = BigInt.fromI32(1);

  for (let i = hex.length - 1; i >= 0; i--) {
    let char = hexUpper.charCodeAt(i);
    let value = 0;

    if (char >= 48 && char <= 57) {
      value = char - 48;
    } else if (char >= 65 && char <= 70) {
      value = char - 55;
    }

    bigInt = bigInt.plus(BigInt.fromI32(value).times(power));
    power = power.times(BigInt.fromI32(16));
  }

  return bigInt;
}

export function tokenToDecimal(amount: BigInt, decimals: i32): BigDecimal {
  let scale = BigInt.fromI32(10)
    .pow(decimals as u8)
    .toBigDecimal();
  return amount.toBigDecimal().div(scale);
}

export function scaleDown(num: BigInt, decimals: i32): BigDecimal {
  return num.divDecimal(BigInt.fromI32(10).pow(u8(decimals)).toBigDecimal());
}

export function scaleUp(num: BigDecimal, decimals: i32): BigInt {
  return BigInt.fromString(
    num
      .truncate(decimals)
      .times(BigInt.fromI32(10).pow(u8(decimals)).toBigDecimal())
      .toString()
  );
}
