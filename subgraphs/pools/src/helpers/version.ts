import { json, JSONValueKind } from "@graphprotocol/graph-ts";

/**
 * Parses Balancer pool `version()` JSON (e.g. {"name":"WeightedPool","version":2,...})
 * into an integer factoryVersion for the Factory entity.
 */
export function getFactoryVersion(versionJson: string): i32 {
  let parsed = json.try_fromString(versionJson);
  if (parsed.isError) return 0;

  let value = parsed.value;
  if (value.kind != JSONValueKind.OBJECT) return 0;

  let versionValue = value.toObject().get("version");
  if (!versionValue || versionValue.kind != JSONValueKind.NUMBER) return 0;

  return versionValue.toI64() as i32;
}
