import {
  afterEach,
  assert,
  clearStore,
  dataSourceMock,
  describe,
  test,
} from "matchstick-as/assembly/index";
import { Address, BigInt } from "@graphprotocol/graph-ts";
import { Swap as SwapEvent } from "../src/types/Vault/Vault";
import { Transfer } from "../src/types/templates/BPT/BPT";
import { handleSwap } from "../src/mappings/vault";
import { handleTransfer } from "../src/mappings/bpt";
import { getPoolShareId } from "../src/helpers/entities";
import { VAULT_ADDRESS, ZERO_ADDRESS } from "../src/helpers/constants";
import { Pool, PoolShare, Swap } from "../src/types/schema";
import {
  HOLDER,
  POOL,
  TOKEN_A,
  TOKEN_B,
  addressParam,
  assertBd,
  bd,
  createTestPool,
  createTestPoolToken,
  loadTestPoolToken,
  mockEvent,
  mockPoolTokenInfo,
  setStoreEventsFrom,
  uintParam,
  wad,
} from "./fixtures";

afterEach(() => {
  clearStore();
  dataSourceMock.resetValues();
});

function swapEvent(swapFeePercentage: BigInt, swapFeeAmount: BigInt): SwapEvent {
  let event = changetype<SwapEvent>(
    mockEvent([
      addressParam("pool", POOL),
      addressParam("tokenIn", TOKEN_A),
      addressParam("tokenOut", TOKEN_B),
      uintParam("amountIn", wad("100")),
      uintParam("amountOut", wad("90")),
      uintParam("swapFeePercentage", swapFeePercentage),
      uintParam("swapFeeAmount", swapFeeAmount),
    ])
  );
  event.address = VAULT_ADDRESS;
  return event;
}

function setUpSwapPool(): void {
  createTestPool(); // static swap fee 1%
  createTestPoolToken(POOL, TOKEN_A, 0);
  createTestPoolToken(POOL, TOKEN_B, 1);
  mockPoolTokenInfo(POOL, [TOKEN_A, TOKEN_B], [wad("1100"), wad("910")]);
}

describe("swap fee counters", () => {
  test("a static-fee swap counts only toward totalStaticSwapFee", () => {
    setUpSwapPool();
    setStoreEventsFrom(1);
    let event = swapEvent(wad("0.01"), wad("1"));
    handleSwap(event);

    // The Vault Swap event has no swapper; user is the transaction sender.
    let swap = Swap.load(
      event.transaction.hash.concatI32(event.logIndex.toI32())
    ) as Swap;
    assert.bytesEquals(swap.user, event.transaction.from);
    assert.booleanEquals(swap.hasDynamicSwapFee, false);

    let poolToken = loadTestPoolToken(POOL, TOKEN_A);
    assertBd(poolToken.totalSwapFee, "1", "totalSwapFee");
    assertBd(poolToken.totalStaticSwapFee, "1", "totalStaticSwapFee");
    assertBd(poolToken.totalDynamicSwapFee, "0", "totalDynamicSwapFee");
  });

  test("a dynamic-fee swap counts only toward totalDynamicSwapFee", () => {
    setUpSwapPool();
    handleSwap(swapEvent(wad("0.03"), wad("3")));

    let poolToken = loadTestPoolToken(POOL, TOKEN_A);
    assertBd(poolToken.totalSwapFee, "3", "totalSwapFee");
    assertBd(poolToken.totalStaticSwapFee, "0", "totalStaticSwapFee");
    assertBd(poolToken.totalDynamicSwapFee, "3", "totalDynamicSwapFee");
    // Base/delta split of the dynamic fee: 1% static + 2% delta on 100 in.
    assertBd(poolToken.totalSwapFeeBase, "1", "totalSwapFeeBase");
    assertBd(poolToken.totalSwapFeeDelta, "2", "totalSwapFeeDelta");
  });
});

function swapBetween(
  tokenIn: Address,
  tokenOut: Address,
  amountInRaw: BigInt,
  amountOutRaw: BigInt
): SwapEvent {
  let event = changetype<SwapEvent>(
    mockEvent([
      addressParam("pool", POOL),
      addressParam("tokenIn", tokenIn),
      addressParam("tokenOut", tokenOut),
      uintParam("amountIn", amountInRaw),
      uintParam("amountOut", amountOutRaw),
      uintParam("swapFeePercentage", wad("0.01")),
      uintParam("swapFeeAmount", BigInt.zero()),
    ])
  );
  event.address = VAULT_ADDRESS;
  return event;
}

// TOKEN_B (6 decimals) sits at index 0 and is created first; TOKEN_A
// (18 decimals) at index 1. Reading either balance at the other token's
// index gives a wrong value.
function setUpBalances(): void {
  createTestPool();
  createTestPoolToken(POOL, TOKEN_B, 0, 6);
  createTestPoolToken(POOL, TOKEN_A, 1);
  mockPoolTokenInfo(POOL, [TOKEN_B, TOKEN_A], [BigInt.fromI32(910000000), wad("1100")]);
}

describe("swap balances", () => {
  test("store each token's own balance when swapping A for B", () => {
    setUpBalances();
    handleSwap(swapBetween(TOKEN_A, TOKEN_B, wad("100"), BigInt.fromI32(90000000)));

    assertBd(loadTestPoolToken(POOL, TOKEN_A).balance, "1100", "balance A");
    assertBd(loadTestPoolToken(POOL, TOKEN_B).balance, "910", "balance B");
    assertBd(loadTestPoolToken(POOL, TOKEN_A).volume, "100", "volume A");
    assertBd(loadTestPoolToken(POOL, TOKEN_B).volume, "90", "volume B");
  });

  test("store each token's own balance when swapping B for A", () => {
    setUpBalances();
    handleSwap(swapBetween(TOKEN_B, TOKEN_A, BigInt.fromI32(90000000), wad("100")));

    assertBd(loadTestPoolToken(POOL, TOKEN_A).balance, "1100", "balance A");
    assertBd(loadTestPoolToken(POOL, TOKEN_B).balance, "910", "balance B");
    assertBd(loadTestPoolToken(POOL, TOKEN_B).volume, "90", "volume B");
  });
});

function transferEvent(from: Address, to: Address, value: BigInt): Transfer {
  let event = changetype<Transfer>(
    mockEvent([addressParam("from", from), addressParam("to", to), uintParam("value", value)])
  );
  event.address = POOL;
  return event;
}

describe("BPT transfers", () => {
  test("the minimum supply mint to 0x0 creates no PoolShare but counts in totalShares", () => {
    createTestPool();
    handleTransfer(transferEvent(ZERO_ADDRESS, ZERO_ADDRESS, BigInt.fromI32(1000000)));

    assert.notInStore("PoolShare", getPoolShareId(POOL, ZERO_ADDRESS));
    let pool = Pool.load(POOL) as Pool;
    assertBd(pool.totalShares, "0.000000000001", "totalShares");
    assert.bigIntEquals(pool.holdersCount, BigInt.zero());
  });

  test("a self-transfer leaves balance and holdersCount unchanged", () => {
    createTestPool();
    handleTransfer(transferEvent(ZERO_ADDRESS, HOLDER, wad("5")));
    handleTransfer(transferEvent(HOLDER, HOLDER, wad("5")));

    let share = PoolShare.load(getPoolShareId(POOL, HOLDER)) as PoolShare;
    assertBd(share.balance, "5", "balance");
    let pool = Pool.load(POOL) as Pool;
    assert.bigIntEquals(pool.holdersCount, BigInt.fromI32(1));
  });

  test("burning the full balance decrements holdersCount", () => {
    createTestPool();
    handleTransfer(transferEvent(ZERO_ADDRESS, HOLDER, wad("5")));
    handleTransfer(transferEvent(HOLDER, ZERO_ADDRESS, wad("5")));

    let share = PoolShare.load(getPoolShareId(POOL, HOLDER)) as PoolShare;
    assertBd(share.balance, "0", "balance");
    let pool = Pool.load(POOL) as Pool;
    assert.bigIntEquals(pool.holdersCount, BigInt.zero());
    assertBd(pool.totalShares, "0", "totalShares");
  });
});
