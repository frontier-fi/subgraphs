import { afterEach, assert, clearStore, describe, test } from "matchstick-as/assembly/index";
import { BigInt } from "@graphprotocol/graph-ts";
import {
  InitialPoolAggregateSwapFeePercentage,
  InitialPoolAggregateYieldFeePercentage,
  PoolRegisteredWithFeeController,
  ProtocolSwapFeeCollected,
  ProtocolSwapFeePercentageChanged,
} from "../src/types/templates/ProtocolFeeController/ProtocolFeeController";
import {
  applyPendingPoolFeeInit,
  handleInitialPoolAggregateSwapFeePercentage,
  handleInitialPoolAggregateYieldFeePercentage,
  handlePoolRegisteredWithFeeController,
  handleProtocolSwapFeeCollected,
  handleProtocolSwapFeePercentageChanged,
} from "../src/mappings/controller";
import { accrueVaultSwapFee, updateProtocolYieldFeeAmounts } from "../src/helpers/entities";
import { Pool } from "../src/types/schema";
import {
  CREATOR,
  POOL,
  TOKEN_A,
  addressParam,
  assertBd,
  bd,
  boolParam,
  createTestPool,
  createTestPoolToken,
  loadTestPoolToken,
  mockAggregateYieldFeeAmount,
  mockEvent,
  uintParam,
  wad,
} from "./fixtures";

afterEach(() => {
  clearStore();
});

describe("fee-controller registration before PoolRegistered", () => {
  test("stashes registration events and applies them once the Pool exists", () => {
    handleInitialPoolAggregateSwapFeePercentage(
      changetype<InitialPoolAggregateSwapFeePercentage>(
        mockEvent([
          addressParam("pool", POOL),
          uintParam("aggregateSwapFeePercentage", wad("0.5")),
          boolParam("isProtocolFeeExempt", false),
        ])
      )
    );
    handleInitialPoolAggregateYieldFeePercentage(
      changetype<InitialPoolAggregateYieldFeePercentage>(
        mockEvent([
          addressParam("pool", POOL),
          uintParam("aggregateYieldFeePercentage", wad("0.1")),
          boolParam("isProtocolFeeExempt", false),
        ])
      )
    );
    handlePoolRegisteredWithFeeController(
      changetype<PoolRegisteredWithFeeController>(
        mockEvent([
          addressParam("pool", POOL),
          addressParam("poolCreator", CREATOR),
          boolParam("protocolFeeExempt", false),
        ])
      )
    );
    assert.entityCount("PendingPoolFeeInit", 1);

    let pool = createTestPool();
    applyPendingPoolFeeInit(pool);

    pool = Pool.load(POOL) as Pool;
    assertBd(pool.protocolSwapFee, "0.5", "protocolSwapFee");
    assertBd(pool.aggregateSwapFee, "0.5", "aggregateSwapFee");
    assertBd(pool.protocolYieldFee, "0.1", "protocolYieldFee");
    assertBd(pool.aggregateYieldFee, "0.1", "aggregateYieldFee");
    assert.bytesEquals(pool.poolCreator, CREATOR);
    assert.booleanEquals(pool.protocolFeeExempt, false);
    assert.entityCount("PendingPoolFeeInit", 0);
  });

  test("an exempt registration zeroes protocol and aggregate fees", () => {
    handleInitialPoolAggregateSwapFeePercentage(
      changetype<InitialPoolAggregateSwapFeePercentage>(
        mockEvent([
          addressParam("pool", POOL),
          uintParam("aggregateSwapFeePercentage", BigInt.zero()),
          boolParam("isProtocolFeeExempt", true),
        ])
      )
    );

    let pool = createTestPool();
    pool.protocolSwapFee = bd("0.5");
    pool.protocolYieldFee = bd("0.1");
    pool.save();
    applyPendingPoolFeeInit(pool);

    pool = Pool.load(POOL) as Pool;
    assert.booleanEquals(pool.protocolFeeExempt, true);
    assertBd(pool.protocolSwapFee, "0", "protocolSwapFee");
    assertBd(pool.protocolYieldFee, "0", "protocolYieldFee");
    assertBd(pool.aggregateSwapFee, "0", "aggregateSwapFee");
  });
});

describe("fee-controller percentage changes", () => {
  test("do not overwrite the aggregate fee set by the Vault event", () => {
    let pool = createTestPool();
    pool.protocolSwapFee = bd("0.5");
    pool.poolCreatorSwapFee = bd("0.5");
    pool.aggregateSwapFee = bd("0.75");
    pool.save();

    handleProtocolSwapFeePercentageChanged(
      changetype<ProtocolSwapFeePercentageChanged>(
        mockEvent([addressParam("pool", POOL), uintParam("swapFeePercentage", wad("0.4"))])
      )
    );

    pool = Pool.load(POOL) as Pool;
    assertBd(pool.protocolSwapFee, "0.4", "protocolSwapFee");
    assertBd(pool.aggregateSwapFee, "0.75", "aggregateSwapFee");
  });
});

describe("aggregate fee collection", () => {
  test("splits the full aggregate amount and clears swap and yield pending", () => {
    let pool = createTestPool();
    pool.protocolSwapFee = bd("0.5");
    pool.poolCreatorSwapFee = bd("0.5");
    pool.aggregateSwapFee = bd("0.75");
    pool.save();
    let poolToken = createTestPoolToken(POOL, TOKEN_A, 0);
    poolToken.vaultProtocolSwapFeeBalance = bd("50");
    poolToken.vaultCreatorSwapFeeBalance = bd("25");
    poolToken.vaultProtocolYieldFeeBalance = bd("3");
    poolToken.vaultCreatorYieldFeeBalance = bd("1");
    poolToken.save();

    // The Vault clears swap and yield together; only the swap side emits.
    handleProtocolSwapFeeCollected(
      changetype<ProtocolSwapFeeCollected>(
        mockEvent([
          addressParam("pool", POOL),
          addressParam("token", TOKEN_A),
          uintParam("amount", wad("75")),
        ])
      )
    );

    poolToken = loadTestPoolToken(POOL, TOKEN_A);
    // Protocol share = amount * protocol / aggregate = 75 * 0.5 / 0.75.
    assertBd(poolToken.controllerProtocolFeeBalance, "50", "controllerProtocol");
    assertBd(poolToken.controllerCreatorFeeBalance, "25", "controllerCreator");
    assertBd(poolToken.vaultProtocolSwapFeeBalance, "0", "vaultProtocolSwap");
    assertBd(poolToken.vaultCreatorSwapFeeBalance, "0", "vaultCreatorSwap");
    assertBd(poolToken.vaultProtocolYieldFeeBalance, "0", "vaultProtocolYield");
    assertBd(poolToken.vaultCreatorYieldFeeBalance, "0", "vaultCreatorYield");
  });
});

describe("swap fee accrual", () => {
  test("uses the Vault aggregate fee and splits protocol and creator", () => {
    let pool = createTestPool();
    pool.protocolSwapFee = bd("0.5");
    pool.poolCreatorSwapFee = bd("0.5");
    pool.aggregateSwapFee = bd("0.75");
    pool.save();
    let poolToken = createTestPoolToken(POOL, TOKEN_A, 0);

    accrueVaultSwapFee(poolToken, pool, wad("100"));

    assertBd(poolToken.vaultProtocolSwapFeeBalance, "50", "vaultProtocolSwap");
    assertBd(poolToken.vaultCreatorSwapFeeBalance, "25", "vaultCreatorSwap");
    assertBd(poolToken.totalProtocolSwapFee, "50", "totalProtocolSwap");
    assertBd(poolToken.totalCreatorSwapFee, "25", "totalCreatorSwap");
  });

  test("accrues nothing while the pool is in Recovery Mode", () => {
    let pool = createTestPool();
    pool.protocolSwapFee = bd("0.5");
    pool.aggregateSwapFee = bd("0.5");
    pool.isInRecoveryMode = true;
    pool.save();
    let poolToken = createTestPoolToken(POOL, TOKEN_A, 0);

    accrueVaultSwapFee(poolToken, pool, wad("100"));

    assertBd(poolToken.vaultProtocolSwapFeeBalance, "0", "vaultProtocolSwap");
    assertBd(poolToken.totalProtocolSwapFee, "0", "totalProtocolSwap");
  });
});

describe("yield fee accrual", () => {
  test("keeps earlier pending shares when the creator fee changes", () => {
    let pool = createTestPool();
    pool.protocolYieldFee = bd("0.5");
    pool.aggregateYieldFee = bd("0.5");
    pool.save();
    let poolToken = createTestPoolToken(POOL, TOKEN_A, 0);
    poolToken.paysYieldFees = true;
    poolToken.save();

    mockAggregateYieldFeeAmount(POOL, TOKEN_A, wad("100"));
    updateProtocolYieldFeeAmounts(pool);

    pool.poolCreatorYieldFee = bd("0.5");
    pool.aggregateYieldFee = bd("0.75");
    pool.save();
    mockAggregateYieldFeeAmount(POOL, TOKEN_A, wad("175"));
    updateProtocolYieldFeeAmounts(pool);

    // First 100 was all protocol; the next 75 splits 50 protocol / 25 creator.
    poolToken = loadTestPoolToken(POOL, TOKEN_A);
    assertBd(poolToken.vaultProtocolYieldFeeBalance, "150", "vaultProtocolYield");
    assertBd(poolToken.vaultCreatorYieldFeeBalance, "25", "vaultCreatorYield");
    assertBd(poolToken.totalProtocolYieldFee, "150", "totalProtocolYield");
    assertBd(poolToken.totalCreatorYieldFee, "25", "totalCreatorYield");
  });

  test("scales pending shares down when the aggregate shrinks without a collect", () => {
    let pool = createTestPool();
    pool.protocolYieldFee = bd("0.5");
    pool.poolCreatorYieldFee = bd("0.5");
    pool.aggregateYieldFee = bd("0.75");
    pool.save();
    let poolToken = createTestPoolToken(POOL, TOKEN_A, 0);
    poolToken.paysYieldFees = true;
    poolToken.vaultProtocolYieldFeeBalance = bd("60");
    poolToken.vaultCreatorYieldFeeBalance = bd("40");
    poolToken.totalProtocolYieldFee = bd("60");
    poolToken.totalCreatorYieldFee = bd("40");
    poolToken.save();

    mockAggregateYieldFeeAmount(POOL, TOKEN_A, wad("50"));
    updateProtocolYieldFeeAmounts(pool);

    poolToken = loadTestPoolToken(POOL, TOKEN_A);
    assertBd(poolToken.vaultProtocolYieldFeeBalance, "30", "vaultProtocolYield");
    assertBd(poolToken.vaultCreatorYieldFeeBalance, "20", "vaultCreatorYield");
    assertBd(poolToken.totalProtocolYieldFee, "60", "totalProtocolYield");
    assertBd(poolToken.totalCreatorYieldFee, "40", "totalCreatorYield");
  });
});
