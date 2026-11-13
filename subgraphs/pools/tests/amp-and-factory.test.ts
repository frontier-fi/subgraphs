import {
  afterEach,
  assert,
  clearStore,
  createMockedFunction,
  describe,
  newMockEvent,
  test,
} from "matchstick-as/assembly/index";
import { Address, BigDecimal, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  AmpUpdateStarted,
  AmpUpdateStopped,
} from "../src/types/templates/StablePool/StablePool";
import { handleAmpUpdateStarted, handleAmpUpdateStopped } from "../src/mappings/amp";
import { getFactory } from "../src/helpers/entities";
import { Factory, StableParams } from "../src/types/schema";

const POOL = Address.fromString("0x00000000000000000000000000000000000000a1");
const FACTORY = Address.fromString("0x00000000000000000000000000000000000000f1");

afterEach(() => {
  clearStore();
});

function uintParam(name: string, value: i64): ethereum.EventParam {
  return new ethereum.EventParam(
    name,
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(value))
  );
}

function mockAmplificationParameter(value: i64, isUpdating: boolean): void {
  createMockedFunction(
    POOL,
    "getAmplificationParameter",
    "getAmplificationParameter():(uint256,bool,uint256)"
  ).returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(value)),
    ethereum.Value.fromBoolean(isUpdating),
    ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1000)),
  ]);
}

function assertBd(actual: BigDecimal, expected: string, label: string): void {
  if (!actual.equals(BigDecimal.fromString(expected))) {
    throw new Error(label + ": expected " + expected + ", got " + actual.toString());
  }
}

describe("amp ramp events", () => {
  test("AmpUpdateStarted keeps fractional AMP_PRECISION-scaled endpoints", () => {
    mockAmplificationParameter(150500, true);
    let event = changetype<AmpUpdateStarted>(newMockEvent());
    event.address = POOL;
    event.parameters = [
      uintParam("startValue", 150500),
      uintParam("endValue", 400000),
      uintParam("startTime", 1000),
      uintParam("endTime", 2000),
    ];
    handleAmpUpdateStarted(event);

    let params = StableParams.load(POOL) as StableParams;
    assert.booleanEquals(params.ampIsUpdating, true);
    assertBd(params.ampStartValue, "150.5", "ampStartValue");
    assertBd(params.ampEndValue, "400", "ampEndValue");
    assert.bigIntEquals(params.ampStartTime, BigInt.fromI32(1000));
    assert.bigIntEquals(params.ampEndTime, BigInt.fromI32(2000));
    assert.bigIntEquals(params.amp, BigInt.fromI32(150));
  });

  test("AmpUpdateStopped clears the ramp and stores the current amp", () => {
    mockAmplificationParameter(150500, true);
    let started = changetype<AmpUpdateStarted>(newMockEvent());
    started.address = POOL;
    started.parameters = [
      uintParam("startValue", 150500),
      uintParam("endValue", 400000),
      uintParam("startTime", 1000),
      uintParam("endTime", 2000),
    ];
    handleAmpUpdateStarted(started);

    mockAmplificationParameter(250000, false);
    let stopped = changetype<AmpUpdateStopped>(newMockEvent());
    stopped.address = POOL;
    stopped.parameters = [uintParam("currentValue", 250000)];
    handleAmpUpdateStopped(stopped);

    let params = StableParams.load(POOL) as StableParams;
    assert.booleanEquals(params.ampIsUpdating, false);
    assert.bigIntEquals(params.amp, BigInt.fromI32(250));
    assertBd(params.ampStartValue, "0", "ampStartValue");
    assertBd(params.ampEndValue, "0", "ampEndValue");
    assert.bigIntEquals(params.ampEndTime, BigInt.zero());
  });
});

describe("factory version", () => {
  test("a factory first stored with version 0 is filled in by a later pool", () => {
    getFactory(FACTORY, "Stable", 0);
    getFactory(FACTORY, "Stable", 2);
    let factory = Factory.load(FACTORY) as Factory;
    assert.i32Equals(factory.version, 2);

    // A known version is never overwritten.
    getFactory(FACTORY, "Stable", 3);
    factory = Factory.load(FACTORY) as Factory;
    assert.i32Equals(factory.version, 2);
  });
});
