import {
  afterEach,
  assert,
  clearStore,
  createMockedFunction,
  dataSourceMock,
  describe,
  test,
} from "matchstick-as/assembly/index";
import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  BufferSharesBurned,
  BufferSharesMinted,
  LiquidityAddedToBuffer,
  Unwrap,
  Wrap,
} from "../src/types/Vault/Vault";
import {
  getBuffer,
  handleBufferSharesBurned,
  handleBufferSharesMinted,
  handleLiquidityAddedToBuffer,
  handleUnwrap,
  handleWrap,
} from "../src/mappings/vault";
import { probeErc4626 } from "../src/helpers/entities";
import { Buffer, BufferShare, BufferWrapUnwrap, Token } from "../src/types/schema";
import {
  HOLDER,
  POOL,
  addressParam,
  assertBd,
  bufferBalances,
  bytes32Param,
  createTestPool,
  createTestPoolToken,
  createTestToken,
  loadTestPoolToken,
  mockEvent,
  setStoreEventsFrom,
  uintParam,
} from "./fixtures";

// 18-decimal wrapped token over a 6-decimal underlying, like waUSDC over USDC.
const WRAPPED = Address.fromString("0x00000000000000000000000000000000000000d1");
const UNDERLYING = Address.fromString("0x00000000000000000000000000000000000000d2");

afterEach(() => {
  clearStore();
  dataSourceMock.resetValues();
});

function mockAsset(token: Address, asset: Address): void {
  createMockedFunction(token, "asset", "asset():(address)").returns([
    ethereum.Value.fromAddress(asset),
  ]);
}

function setUpTokens(): void {
  createTestToken(WRAPPED, 18);
  createTestToken(UNDERLYING, 6);
  mockAsset(WRAPPED, UNDERLYING);
}

function e18(n: i32): BigInt {
  return BigInt.fromI32(n).times(BigInt.fromI32(10).pow(18));
}

function e6(n: i32): BigInt {
  return BigInt.fromI32(n).times(BigInt.fromI32(10).pow(6));
}

describe("ERC-4626 probe", () => {
  test("flags the token and its underlying without creating a Buffer", () => {
    setUpTokens();
    let underlying = probeErc4626(WRAPPED);

    assert.assertTrue(underlying!.equals(UNDERLYING));
    let token = Token.load(WRAPPED) as Token;
    assert.booleanEquals(token.isErc4626, true);
    assert.bytesEquals(token.underlyingToken!, UNDERLYING);
    // Vault buffers only exist after initializeBuffer.
    assert.entityCount("Buffer", 0);
  });

  test("returns null and leaves the token unflagged when asset() reverts", () => {
    createTestToken(WRAPPED, 18);
    createMockedFunction(WRAPPED, "asset", "asset():(address)").reverts();

    let underlying = probeErc4626(WRAPPED);
    assert.assertTrue(!underlying);
    let token = Token.load(WRAPPED) as Token;
    assert.booleanEquals(token.isErc4626, false);
  });
});

describe("getBuffer", () => {
  test("creates the Buffer once and links PoolTokens that already hold the wrapped token", () => {
    setUpTokens();
    createTestPool();
    createTestPoolToken(POOL, WRAPPED, 0);

    let buffer = getBuffer(WRAPPED);
    assert.bytesEquals(buffer.underlyingToken, UNDERLYING);
    let poolToken = loadTestPoolToken(POOL, WRAPPED);
    assert.bytesEquals(poolToken.buffer!, WRAPPED);
  });

  test("returns an existing Buffer without eth_calls", () => {
    setUpTokens();
    getBuffer(WRAPPED);
    // A second asset() call would now revert; an existing Buffer must not probe.
    createMockedFunction(WRAPPED, "asset", "asset():(address)").reverts();

    let buffer = getBuffer(WRAPPED);
    assert.bytesEquals(buffer.underlyingToken, UNDERLYING);
    assert.entityCount("Buffer", 1);
  });
});

describe("buffer balances", () => {
  test("LiquidityAddedToBuffer applies absolute balances in each token's decimals", () => {
    setUpTokens();
    handleLiquidityAddedToBuffer(
      changetype<LiquidityAddedToBuffer>(
        mockEvent([
          addressParam("wrappedToken", WRAPPED),
          uintParam("amountUnderlying", e6(50)),
          uintParam("amountWrapped", e18(40)),
          bytes32Param("bufferBalances", bufferBalances(e18(40), e6(50))),
        ])
      )
    );

    let buffer = Buffer.load(WRAPPED) as Buffer;
    assertBd(buffer.wrappedBalance, "40", "wrappedBalance");
    assertBd(buffer.underlyingBalance, "50", "underlyingBalance");
  });

  test("BufferShares mint and burn net out on the same BufferShare", () => {
    setUpTokens();
    handleBufferSharesMinted(
      changetype<BufferSharesMinted>(
        mockEvent([
          addressParam("wrappedToken", WRAPPED),
          addressParam("to", HOLDER),
          uintParam("issuedShares", e18(10)),
        ])
      )
    );
    handleBufferSharesBurned(
      changetype<BufferSharesBurned>(
        mockEvent([
          addressParam("wrappedToken", WRAPPED),
          addressParam("from", HOLDER),
          uintParam("burnedShares", e18(4)),
        ])
      )
    );

    let share = BufferShare.load(WRAPPED.concat(HOLDER)) as BufferShare;
    assertBd(share.balance, "6", "share balance");
    let buffer = Buffer.load(WRAPPED) as Buffer;
    assertBd(buffer.totalShares, "6", "totalShares");
    assert.entityCount("BufferShare", 1);
  });
});

describe("Wrap and Unwrap", () => {
  test("Wrap records underlying deposited and shares minted with post-op balances", () => {
    setUpTokens();
    setStoreEventsFrom(1);
    let event = changetype<Wrap>(
      mockEvent([
        addressParam("wrappedToken", WRAPPED),
        uintParam("depositedUnderlying", e6(100)),
        uintParam("mintedShares", e18(95)),
        bytes32Param("bufferBalances", bufferBalances(e18(5), e6(200))),
      ])
    );
    handleWrap(event);

    let entry = BufferWrapUnwrap.load(
      event.transaction.hash.concatI32(event.logIndex.toI32())
    ) as BufferWrapUnwrap;
    assert.stringEquals(entry.type, "Wrap");
    assertBd(entry.amountUnderlying, "100", "amountUnderlying");
    assertBd(entry.amountWrapped, "95", "amountWrapped");
    assertBd(entry.wrappedBalance, "5", "wrappedBalance");
    assertBd(entry.underlyingBalance, "200", "underlyingBalance");
    assert.bytesEquals(entry.user, event.transaction.from);
  });

  test("Unwrap records shares burned and underlying withdrawn", () => {
    setUpTokens();
    setStoreEventsFrom(1);
    let event = changetype<Unwrap>(
      mockEvent([
        addressParam("wrappedToken", WRAPPED),
        uintParam("burnedShares", e18(20)),
        uintParam("withdrawnUnderlying", e6(21)),
        bytes32Param("bufferBalances", bufferBalances(e18(25), e6(179))),
      ])
    );
    handleUnwrap(event);

    let entry = BufferWrapUnwrap.load(
      event.transaction.hash.concatI32(event.logIndex.toI32())
    ) as BufferWrapUnwrap;
    assert.stringEquals(entry.type, "Unwrap");
    assertBd(entry.amountWrapped, "20", "amountWrapped");
    assertBd(entry.amountUnderlying, "21", "amountUnderlying");
  });

  test("records nothing before storeEventsFrom but still updates the Buffer", () => {
    setUpTokens();
    setStoreEventsFrom(1000000);
    handleWrap(
      changetype<Wrap>(
        mockEvent([
          addressParam("wrappedToken", WRAPPED),
          uintParam("depositedUnderlying", e6(100)),
          uintParam("mintedShares", e18(95)),
          bytes32Param("bufferBalances", bufferBalances(e18(5), e6(200))),
        ])
      )
    );

    assert.entityCount("BufferWrapUnwrap", 0);
    let buffer = Buffer.load(WRAPPED) as Buffer;
    assertBd(buffer.underlyingBalance, "200", "underlyingBalance");
  });
});
