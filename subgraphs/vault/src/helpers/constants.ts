import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts";

export const ZERO_BI = BigInt.fromString("0");
export const ZERO_BD = BigDecimal.fromString("0");
export const ONE_BD = BigDecimal.fromString("1");

export const ZERO_ADDRESS = Address.fromString(
  "0x0000000000000000000000000000000000000000"
);

export let VAULT_ADDRESS = Address.fromString(
  "0xbA1333333333a1BA1108E8412f11850A5C319bA9"
);
