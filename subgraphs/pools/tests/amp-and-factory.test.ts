import {
  afterEach,
  assert,
  clearStore,
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

function assertBd(actual: BigDecimal, expected: string, label: string): void {
  if (!actual.equals(BigDecimal.fromString(expected))) {
    throw new Error(label + ": expected " + expected + ", got " + actual.toString());
  }
}

// No getAmplificationParameter mock: the amp handlers must not call the pool.
describe("amp ramp events", () => {
  test("AmpUpdateStarted keeps fractional AMP_PRECISION-scaled endpoints", () => {
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
    // The ramp starts from the current amp, so startValue is the amp now.
    assert.bigIntEquals(BigInt.fromI32(150500), params.ampRaw);
    assert.bigIntEquals(BigInt.fromI32(150), params.amp);
  });

  test("AmpUpdateStopped clears the ramp and stores the current amp", () => {
    let started = changetype<AmpUpdateStarted>(newMockEvent());
    started.address = POOL;
    started.parameters = [
      uintParam("startValue", 150500),
      uintParam("endValue", 400000),
      uintParam("startTime", 1000),
      uintParam("endTime", 2000),
    ];
    handleAmpUpdateStarted(started);

    let stopped = changetype<AmpUpdateStopped>(newMockEvent());
    stopped.address = POOL;
    stopped.parameters = [uintParam("currentValue", 250700)];
    handleAmpUpdateStopped(stopped);

    let params = StableParams.load(POOL) as StableParams;
    assert.booleanEquals(params.ampIsUpdating, false);
    assert.bigIntEquals(BigInt.fromI32(250700), params.ampRaw);
    assert.bigIntEquals(BigInt.fromI32(250), params.amp);
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
