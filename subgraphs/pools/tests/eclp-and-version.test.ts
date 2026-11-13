import {
  afterEach,
  assert,
  clearStore,
  createMockedFunction,
  describe,
  newMockEvent,
  test,
} from "matchstick-as/assembly/index";
import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { PoolCreated } from "../src/types/GyroECLPPoolFactory/BasePoolFactory";
import { handleEclpPoolCreated } from "../src/mappings/eclp";
import {
  EclpRawParams,
  derivedParamsAreConsistent,
  tauMatchesBounds,
  tauVectorsAreNormalized,
} from "../src/helpers/eclp";
import { getFactoryVersion } from "../src/helpers/version";
import { Factory } from "../src/types/schema";

const POOL = Address.fromString("0xFC498c37fc12cE063385306eDAEDB384916E75f4");
const FACTORY = Address.fromString("0xED6D268cAdBea94c34E531C3401d41a882D66A8D");

afterEach(() => {
  clearStore();
});

function bi(value: string): BigInt {
  return BigInt.fromString(value);
}

/**
 * getGyroECLPPoolImmutableData() of the Sepolia MockGyroECLPPool (frontier-fi/deployments
 * task 20261021-gyro-eclp), an honest pool.
 */
function sepoliaParams(): EclpRawParams {
  return new EclpRawParams(
    bi("998502246630054917"),
    bi("1000200040008001600"),
    bi("707106781186547524"),
    bi("707106781186547524"),
    bi("4000000000000000000000"),
    bi("-94861212813096057289512505574275160547"),
    bi("31644119574235279926451292677567331630"),
    bi("37142269533113549537591131345643981951"),
    bi("92846388265400743995957747409218517601"),
    bi("66001741173104803338721745994955553010"),
    bi("62245253919818011890633399060291020887"),
    bi("30601134345582732000058913853921008022"),
    bi("-28859471639991253843240999485797747790"),
    bi("99999999999999999886624093342106115200")
  );
}

describe("ECLP parameter checks", () => {
  test("accept the honest Sepolia pool", () => {
    let p = sepoliaParams();
    assert.assertTrue(derivedParamsAreConsistent(p));
    assert.assertTrue(tauVectorsAreNormalized(p));
    assert.assertTrue(tauMatchesBounds(p));
  });

  test("reject a derived set with z of the wrong sign", () => {
    let p = sepoliaParams();
    p.z = p.z.neg();
    assert.assertTrue(!derivedParamsAreConsistent(p));
  });

  test("reject tau vectors that are not unit length", () => {
    let p = sepoliaParams();
    p.tauAlphaX = p.tauAlphaX.times(BigInt.fromI32(2));
    p.tauAlphaY = p.tauAlphaY.times(BigInt.fromI32(2));
    assert.assertTrue(!tauVectorsAreNormalized(p));
  });

  test("reject tau vectors that belong to different price bounds", () => {
    let p = sepoliaParams();
    p.alpha = bi("990000000000000000");
    assert.assertTrue(!tauMatchesBounds(p));
  });
});

function mockPool(p: EclpRawParams, versionJson: string): void {
  createMockedFunction(POOL, "version", "version():(string)").returns([
    ethereum.Value.fromString(versionJson),
  ]);
  let data = new ethereum.Tuple();
  data.push(ethereum.Value.fromAddressArray([]));
  data.push(ethereum.Value.fromUnsignedBigIntArray([]));
  let ints = [
    p.alpha, p.beta, p.c, p.s, p.lambda,
    p.tauAlphaX, p.tauAlphaY, p.tauBetaX, p.tauBetaY,
    p.u, p.v, p.w, p.z, p.dSq,
  ];
  for (let i = 0; i < ints.length; i++) {
    data.push(ethereum.Value.fromSignedBigInt(ints[i]));
  }
  createMockedFunction(
    POOL,
    "getGyroECLPPoolImmutableData",
    "getGyroECLPPoolImmutableData():((address[],uint256[],int256,int256,int256,int256,int256,int256,int256,int256,int256,int256,int256,int256,int256,int256))"
  ).returns([ethereum.Value.fromTuple(data)]);
}

function poolCreatedEvent(): PoolCreated {
  let event = changetype<PoolCreated>(newMockEvent());
  event.address = FACTORY;
  event.parameters = [new ethereum.EventParam("pool", ethereum.Value.fromAddress(POOL))];
  return event;
}

describe("ECLP pool creation", () => {
  test("indexes an honest pool with its factory version", () => {
    mockPool(sepoliaParams(), '{"name":"GyroECLPPool","version":1,"deployment":"x"}');
    handleEclpPoolCreated(poolCreatedEvent());

    assert.entityCount("Pool", 1);
    assert.entityCount("EclpParams", 1);
    let factory = Factory.load(FACTORY) as Factory;
    assert.i32Equals(factory.version, 1);
    assert.stringEquals(factory.type, "ECLP");
  });

  test("does not index a pool whose derived params are inconsistent", () => {
    let p = sepoliaParams();
    p.z = p.z.neg();
    mockPool(p, '{"name":"GyroECLPPool","version":1}');
    handleEclpPoolCreated(poolCreatedEvent());

    assert.entityCount("Pool", 0);
    assert.entityCount("EclpParams", 0);
    assert.entityCount("Factory", 0);
  });
});

describe("getFactoryVersion", () => {
  test("parses the version field of version() JSON", () => {
    assert.i32Equals(getFactoryVersion('{"name":"StablePool","version":2,"deployment":"x"}'), 2);
  });

  test("returns 0 for invalid JSON, a non-object, or a missing or non-numeric version", () => {
    assert.i32Equals(getFactoryVersion("not json"), 0);
    assert.i32Equals(getFactoryVersion("[1,2]"), 0);
    assert.i32Equals(getFactoryVersion('{"name":"StablePool"}'), 0);
    assert.i32Equals(getFactoryVersion('{"version":"2"}'), 0);
  });
});
