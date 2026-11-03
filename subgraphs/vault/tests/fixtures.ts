import { Address, BigDecimal, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { createMockedFunction, newMockEvent } from "matchstick-as/assembly/index";
import { Pool, PoolToken, Token } from "../src/types/schema";
import { VAULT_ADDRESS, ZERO_ADDRESS, ZERO_BD } from "../src/helpers/constants";

export const POOL = Address.fromString("0x00000000000000000000000000000000000000a1");
export const TOKEN_A = Address.fromString("0x00000000000000000000000000000000000000b1");
export const TOKEN_B = Address.fromString("0x00000000000000000000000000000000000000b2");
export const HOLDER = Address.fromString("0x00000000000000000000000000000000000000c1");
export const CREATOR = Address.fromString("0x00000000000000000000000000000000000000c2");

export function bd(value: string): BigDecimal {
  return BigDecimal.fromString(value);
}

/** 18-decimal fixed point, e.g. wad("0.5") == 5e17. */
export function wad(value: string): BigInt {
  return BigInt.fromString(
    bd(value).times(bd("1000000000000000000")).truncate(0).toString()
  );
}

export function createTestToken(address: Address): Token {
  let token = new Token(address);
  token.name = "Token";
  token.symbol = "TKN";
  token.decimals = 18;
  token.address = address;
  token.isErc4626 = false;
  token.underlyingToken = null;
  token.save();
  return token;
}

/** Pool with zero fees, out of recovery mode. Callers override what they test. */
export function createTestPool(address: Address = POOL): Pool {
  let pool = new Pool(address);
  pool.vault = VAULT_ADDRESS;
  pool.hook = ZERO_ADDRESS;
  pool.hookConfig = address;
  pool.liquidityManagement = address;
  pool.factory = ZERO_ADDRESS;
  pool.address = address;
  pool.name = "Test Pool";
  pool.symbol = "TP";
  pool.swapFee = bd("0.01");
  pool.totalShares = ZERO_BD;
  pool.pauseWindowEndTime = BigInt.zero();
  pool.blockNumber = BigInt.zero();
  pool.blockTimestamp = BigInt.zero();
  pool.transactionHash = address;
  pool.isInitialized = true;
  pool.isPaused = false;
  pool.isInRecoveryMode = false;
  pool.protocolFeeExempt = false;
  pool.pauseManager = ZERO_ADDRESS;
  pool.swapFeeManager = ZERO_ADDRESS;
  pool.poolCreator = ZERO_ADDRESS;
  pool.protocolSwapFee = ZERO_BD;
  pool.protocolYieldFee = ZERO_BD;
  pool.poolCreatorSwapFee = ZERO_BD;
  pool.poolCreatorYieldFee = ZERO_BD;
  pool.aggregateSwapFee = ZERO_BD;
  pool.aggregateYieldFee = ZERO_BD;
  pool.swapsCount = BigInt.zero();
  pool.holdersCount = BigInt.zero();
  pool.save();
  return pool;
}

export function createTestPoolToken(
  pool: Address,
  token: Address,
  index: i32
): PoolToken {
  createTestToken(token);
  let poolToken = new PoolToken(pool.concat(token));
  poolToken.pool = pool;
  poolToken.index = index;
  poolToken.name = "Token";
  poolToken.symbol = "TKN";
  poolToken.decimals = 18;
  poolToken.address = token;
  poolToken.token = token;
  poolToken.tokenType = 0;
  poolToken.rateProvider = ZERO_ADDRESS;
  poolToken.balance = ZERO_BD;
  poolToken.volume = ZERO_BD;
  poolToken.totalSwapFee = ZERO_BD;
  poolToken.totalSwapFeeBase = ZERO_BD;
  poolToken.totalSwapFeeDelta = ZERO_BD;
  poolToken.totalStaticSwapFee = ZERO_BD;
  poolToken.totalDynamicSwapFee = ZERO_BD;
  poolToken.priceRate = bd("1");
  poolToken.scalingFactor = BigInt.fromI32(1);
  poolToken.totalProtocolSwapFee = ZERO_BD;
  poolToken.totalProtocolYieldFee = ZERO_BD;
  poolToken.totalCreatorSwapFee = ZERO_BD;
  poolToken.totalCreatorYieldFee = ZERO_BD;
  poolToken.paysYieldFees = false;
  poolToken.controllerProtocolFeeBalance = ZERO_BD;
  poolToken.controllerCreatorFeeBalance = ZERO_BD;
  poolToken.vaultProtocolSwapFeeBalance = ZERO_BD;
  poolToken.vaultProtocolYieldFeeBalance = ZERO_BD;
  poolToken.vaultCreatorSwapFeeBalance = ZERO_BD;
  poolToken.vaultCreatorYieldFeeBalance = ZERO_BD;
  poolToken.save();
  return poolToken;
}

export function loadTestPoolToken(pool: Address, token: Address): PoolToken {
  return PoolToken.load(pool.concat(token)) as PoolToken;
}

export function mockEvent(params: ethereum.EventParam[]): ethereum.Event {
  let event = newMockEvent();
  event.parameters = params;
  return event;
}

export function addressParam(name: string, value: Address): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromAddress(value));
}

export function uintParam(name: string, value: BigInt): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromUnsignedBigInt(value));
}

export function boolParam(name: string, value: boolean): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromBoolean(value));
}

export function mockAggregateYieldFeeAmount(
  pool: Address,
  token: Address,
  amountRaw: BigInt
): void {
  createMockedFunction(
    VAULT_ADDRESS,
    "getAggregateYieldFeeAmount",
    "getAggregateYieldFeeAmount(address,address):(uint256)"
  )
    .withArgs([ethereum.Value.fromAddress(pool), ethereum.Value.fromAddress(token)])
    .returns([ethereum.Value.fromUnsignedBigInt(amountRaw)]);
}

/** getPoolTokenInfo with STANDARD tokens and the given raw balances. */
export function mockPoolTokenInfo(
  pool: Address,
  tokens: Address[],
  balancesRaw: BigInt[]
): void {
  let configs: ethereum.Tuple[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let config = new ethereum.Tuple();
    config.push(ethereum.Value.fromUnsignedBigInt(BigInt.zero()));
    config.push(ethereum.Value.fromAddress(ZERO_ADDRESS));
    config.push(ethereum.Value.fromBoolean(false));
    configs.push(config);
  }
  createMockedFunction(
    VAULT_ADDRESS,
    "getPoolTokenInfo",
    "getPoolTokenInfo(address):(address[],(uint8,address,bool)[],uint256[],uint256[])"
  )
    .withArgs([ethereum.Value.fromAddress(pool)])
    .returns([
      ethereum.Value.fromAddressArray(tokens),
      ethereum.Value.fromTupleArray(configs),
      ethereum.Value.fromUnsignedBigIntArray(balancesRaw),
      ethereum.Value.fromUnsignedBigIntArray(balancesRaw),
    ]);
}

export function assertBd(actual: BigDecimal, expected: string, label: string): void {
  if (!actual.equals(bd(expected))) {
    throw new Error(label + ": expected " + expected + ", got " + actual.toString());
  }
}
