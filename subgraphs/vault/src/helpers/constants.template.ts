import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts";

export const ZERO_BI = BigInt.fromString("0");
export const ZERO_BD = BigDecimal.fromString("0");
export const ONE_BD = BigDecimal.fromString("1");

export const ZERO_ADDRESS = Address.fromString(
  "0x0000000000000000000000000000000000000000"
);

// Generated from networks.json — do not edit constants.ts directly.
export let VAULT_ADDRESS = Address.fromString("{{ Vault.address }}");
