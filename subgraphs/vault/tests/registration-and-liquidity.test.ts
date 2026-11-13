import {
  afterEach,
  assert,
  clearStore,
  createMockedFunction,
  dataSourceMock,
  describe,
  newMockEvent,
  test,
} from "matchstick-as/assembly/index";
import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  AuthorizerChanged,
  LiquidityAdded,
  LiquidityRemoved,
  PoolRegistered,
  VaultPausedStateChanged,
} from "../src/types/Vault/Vault";
import {
  handleAuthorizerChanged,
  handleLiquidityAdded,
  handleLiquidityRemoved,
  handlePoolRegistered,
  handleVaultPausedStateChanged,
} from "../src/mappings/vault";
import { getVault } from "../src/helpers/entities";
import { VAULT_ADDRESS, ZERO_ADDRESS } from "../src/helpers/constants";
import { AddRemove, Pool, RateProvider, Token, Vault } from "../src/types/schema";
import {
  CREATOR,
  HOLDER,
  POOL,
  TOKEN_A,
  TOKEN_B,
  addressParam,
  assertBd,
  boolParam,
  createTestPool,
  createTestPoolToken,
  createTestToken,
  createTestVault,
  loadTestPoolToken,
  mockEvent,
  mockPoolTokenInfo,
  setStoreEventsFrom,
  uintArrayParam,
  uintParam,
  wad,
} from "./fixtures";

const RATE_PROVIDER = Address.fromString("0x00000000000000000000000000000000000000e1");
const UNDERLYING = Address.fromString("0x00000000000000000000000000000000000000e2");
const PARENT = Address.fromString("0x00000000000000000000000000000000000000a2");

afterEach(() => {
  clearStore();
  dataSourceMock.resetValues();
});

function tokenConfig(
  token: Address,
  tokenType: i32,
  rateProvider: Address,
  paysYieldFees: boolean
): ethereum.Tuple {
  let config = new ethereum.Tuple();
  config.push(ethereum.Value.fromAddress(token));
  config.push(ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tokenType)));
  config.push(ethereum.Value.fromAddress(rateProvider));
  config.push(ethereum.Value.fromBoolean(paysYieldFees));
  return config;
}

function boolTuple(count: i32, last: Address | null): ethereum.Tuple {
  let tuple = new ethereum.Tuple();
  for (let i = 0; i < count; i++) tuple.push(ethereum.Value.fromBoolean(false));
  if (last) tuple.push(ethereum.Value.fromAddress(last));
  return tuple;
}

function mockPoolBasics(pool: Address): void {
  createMockedFunction(pool, "name", "name():(string)").returns([
    ethereum.Value.fromString("Test Pool"),
  ]);
  createMockedFunction(pool, "symbol", "symbol():(string)").returns([
    ethereum.Value.fromString("TP"),
  ]);
  createMockedFunction(
    VAULT_ADDRESS,
    "getStaticSwapFeePercentage",
    "getStaticSwapFeePercentage(address):(uint256)"
  )
    .withArgs([ethereum.Value.fromAddress(pool)])
    .returns([ethereum.Value.fromUnsignedBigInt(wad("0.003"))]);
}

function poolRegisteredEvent(pool: Address, configs: ethereum.Tuple[]): PoolRegistered {
  let roleAccounts = new ethereum.Tuple();
  roleAccounts.push(ethereum.Value.fromAddress(ZERO_ADDRESS));
  roleAccounts.push(ethereum.Value.fromAddress(ZERO_ADDRESS));
  roleAccounts.push(ethereum.Value.fromAddress(CREATOR));

  let event = changetype<PoolRegistered>(newMockEvent());
  event.address = VAULT_ADDRESS;
  event.parameters = [
    addressParam("pool", pool),
    addressParam("factory", ZERO_ADDRESS),
    new ethereum.EventParam("tokenConfig", ethereum.Value.fromTupleArray(configs)),
    uintParam("swapFeePercentage", wad("0.003")),
    uintParam("pauseWindowEndTime", BigInt.zero()),
    new ethereum.EventParam("roleAccounts", ethereum.Value.fromTuple(roleAccounts)),
    new ethereum.EventParam(
      "hooksConfig",
      ethereum.Value.fromTuple(boolTuple(10, ZERO_ADDRESS))
    ),
    new ethereum.EventParam(
      "liquidityManagement",
      ethereum.Value.fromTuple(boolTuple(4, null))
    ),
  ];
  return event;
}

describe("PoolRegistered", () => {
  test("indexes tokens, rate providers and ERC-4626 flags without creating a Buffer", () => {
    createTestVault();
    createTestToken(TOKEN_A);
    createTestToken(TOKEN_B);
    createTestToken(UNDERLYING, 6);
    mockPoolBasics(POOL);
    createMockedFunction(TOKEN_B, "asset", "asset():(address)").returns([
      ethereum.Value.fromAddress(UNDERLYING),
    ]);

    handlePoolRegistered(
      poolRegisteredEvent(POOL, [
        tokenConfig(TOKEN_A, 0, ZERO_ADDRESS, false),
        tokenConfig(TOKEN_B, 1, RATE_PROVIDER, true),
      ])
    );

    let pool = Pool.load(POOL) as Pool;
    assertBd(pool.swapFee, "0.003", "swapFee");
    assert.bytesEquals(pool.poolCreator, CREATOR);
    assert.booleanEquals(pool.isInitialized, false);

    let standard = loadTestPoolToken(POOL, TOKEN_A);
    assert.i32Equals(standard.tokenType, 0);
    assert.i32Equals(standard.index, 0);
    let withRate = loadTestPoolToken(POOL, TOKEN_B);
    assert.i32Equals(withRate.tokenType, 1);
    assert.i32Equals(withRate.index, 1);
    assert.booleanEquals(withRate.paysYieldFees, true);
    assert.bytesEquals(withRate.token, TOKEN_B);

    // One RateProvider row per token, including address(0), in registration order.
    assert.entityCount("RateProvider", 2);
    let zeroRow = RateProvider.load(POOL.concat(TOKEN_A).concat(ZERO_ADDRESS));
    assert.assertTrue(zeroRow !== null);

    let wrapped = Token.load(TOKEN_B) as Token;
    assert.booleanEquals(wrapped.isErc4626, true);
    assert.bytesEquals(wrapped.underlyingToken!, UNDERLYING);
    assert.entityCount("Buffer", 0);
  });

  test("backfills nestedPool on a parent pool registered before its child BPT", () => {
    createTestVault();
    createTestToken(TOKEN_A);
    createTestToken(POOL); // the child BPT, held by the parent
    mockPoolBasics(PARENT);
    handlePoolRegistered(
      poolRegisteredEvent(PARENT, [
        tokenConfig(TOKEN_A, 0, ZERO_ADDRESS, false),
        tokenConfig(POOL, 0, ZERO_ADDRESS, false),
      ])
    );
    let nestedBefore = loadTestPoolToken(PARENT, POOL).nestedPool;
    assert.assertTrue(!nestedBefore);

    mockPoolBasics(POOL);
    handlePoolRegistered(
      poolRegisteredEvent(POOL, [tokenConfig(TOKEN_A, 0, ZERO_ADDRESS, false)])
    );

    assert.bytesEquals(loadTestPoolToken(PARENT, POOL).nestedPool!, POOL);
  });
});

function liquidityAddedEvent(amounts: BigInt[]): LiquidityAdded {
  let event = changetype<LiquidityAdded>(
    mockEvent([
      addressParam("pool", POOL),
      addressParam("liquidityProvider", HOLDER),
      uintParam("kind", BigInt.fromI32(1)),
      uintParam("totalSupply", wad("1000")),
      uintArrayParam("amountsAddedRaw", amounts),
      uintArrayParam("swapFeeAmountsRaw", [BigInt.zero(), BigInt.zero()]),
    ])
  );
  event.address = VAULT_ADDRESS;
  return event;
}

function setUpLiquidityPool(): void {
  createTestPool();
  // Created out of index order, so a derived load returns them shuffled.
  createTestPoolToken(POOL, TOKEN_B, 1, 6);
  createTestPoolToken(POOL, TOKEN_A, 0);
  mockPoolTokenInfo(POOL, [TOKEN_A, TOKEN_B], [wad("110"), BigInt.fromI32(220000000)]);
}

describe("LiquidityAdded and LiquidityRemoved", () => {
  test("key amounts and balances by PoolToken.index and save at the storeEventsFrom block", () => {
    setUpLiquidityPool();
    let event = liquidityAddedEvent([wad("10"), BigInt.fromI32(20000000)]);
    setStoreEventsFrom(event.block.number.toI32());
    handleLiquidityAdded(event);

    let add = AddRemove.load(
      event.transaction.hash.concatI32(event.logIndex.toI32())
    ) as AddRemove;
    assert.stringEquals(add.type, "Add");
    assert.i32Equals(add.kind, 1);
    assertBd(add.totalSupply, "1000", "totalSupply");
    assertBd(add.amounts[0], "10", "amounts[0]");
    assertBd(add.amounts[1], "20", "amounts[1]");

    assertBd(loadTestPoolToken(POOL, TOKEN_A).balance, "110", "balance A");
    assertBd(loadTestPoolToken(POOL, TOKEN_B).balance, "220", "balance B");
    assert.booleanEquals((Pool.load(POOL) as Pool).isInitialized, true);
  });

  test("LiquidityRemoved records a Remove keyed by index", () => {
    setUpLiquidityPool();
    let event = changetype<LiquidityRemoved>(
      mockEvent([
        addressParam("pool", POOL),
        addressParam("liquidityProvider", HOLDER),
        uintParam("kind", BigInt.fromI32(0)),
        uintParam("totalSupply", wad("900")),
        uintArrayParam("amountsRemovedRaw", [wad("3"), BigInt.fromI32(4000000)]),
        uintArrayParam("swapFeeAmountsRaw", [BigInt.zero(), BigInt.zero()]),
      ])
    );
    event.address = VAULT_ADDRESS;
    setStoreEventsFrom(1);
    handleLiquidityRemoved(event);

    let remove = AddRemove.load(
      event.transaction.hash.concatI32(event.logIndex.toI32())
    ) as AddRemove;
    assert.stringEquals(remove.type, "Remove");
    assertBd(remove.amounts[0], "3", "amounts[0]");
    assertBd(remove.amounts[1], "4", "amounts[1]");
  });

  test("refreshes priceRate from getPoolTokenRates when a token has a rate", () => {
    setUpLiquidityPool();
    let withRate = loadTestPoolToken(POOL, TOKEN_B);
    withRate.tokenType = 1;
    withRate.save();
    createMockedFunction(
      VAULT_ADDRESS,
      "getPoolTokenRates",
      "getPoolTokenRates(address):(uint256[],uint256[])"
    )
      .withArgs([ethereum.Value.fromAddress(POOL)])
      .returns([
        ethereum.Value.fromUnsignedBigIntArray([wad("1"), wad("1")]),
        ethereum.Value.fromUnsignedBigIntArray([wad("1"), wad("1.05")]),
      ]);

    handleLiquidityAdded(liquidityAddedEvent([wad("10"), BigInt.fromI32(20000000)]));

    assertBd(loadTestPoolToken(POOL, TOKEN_B).priceRate, "1.05", "priceRate");
    assertBd(loadTestPoolToken(POOL, TOKEN_A).priceRate, "1", "priceRate A");
  });
});

describe("Vault state", () => {
  test("getVault seeds the authorizer and fee controller from the Vault", () => {
    let authorizer = Address.fromString("0x00000000000000000000000000000000000000f1");
    let controller = Address.fromString("0x00000000000000000000000000000000000000f2");
    createMockedFunction(VAULT_ADDRESS, "getAuthorizer", "getAuthorizer():(address)").returns([
      ethereum.Value.fromAddress(authorizer),
    ]);
    createMockedFunction(
      VAULT_ADDRESS,
      "getProtocolFeeController",
      "getProtocolFeeController():(address)"
    ).returns([ethereum.Value.fromAddress(controller)]);

    let vault = getVault();
    assert.bytesEquals(vault.authorizer, authorizer);
    assert.bytesEquals(vault.protocolFeeController, controller);
  });

  test("AuthorizerChanged and VaultPausedStateChanged update the Vault", () => {
    createTestVault();
    let authorizer = Address.fromString("0x00000000000000000000000000000000000000f3");
    handleAuthorizerChanged(
      changetype<AuthorizerChanged>(mockEvent([addressParam("newAuthorizer", authorizer)]))
    );
    handleVaultPausedStateChanged(
      changetype<VaultPausedStateChanged>(mockEvent([boolParam("paused", true)]))
    );

    let vault = Vault.load(VAULT_ADDRESS) as Vault;
    assert.bytesEquals(vault.authorizer, authorizer);
    assert.booleanEquals(vault.isPaused, true);
  });
});
