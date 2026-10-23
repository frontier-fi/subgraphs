#!/usr/bin/env node
/**
 * Point the Ormi "latest" tag at a deployed subgraph version via create-tag.
 * Re-running with a new version reassigns the same tag (stable /latest/gn URL).
 */
const BASE_URL = "https://api.subgraph.ormilabs.com";

const [name, version] = process.argv.slice(2);
const deployKey = process.env.ORMI_DEPLOY_KEY;

if (!name || !version) {
  console.error("usage: tag-latest.js <subgraph-name> <version>");
  process.exit(1);
}
if (!deployKey) {
  console.error("ORMI_DEPLOY_KEY is not set");
  process.exit(1);
}

async function main() {
  const res = await fetch(`${BASE_URL}/public_api/v1/0xGraph/tags/create-tag`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deployKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subgraph_name: name,
      version,
      tag: "latest",
    }),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  const entries = Array.isArray(json) ? json : [json];
  const okBody = entries.every(
    (r) =>
      !r ||
      typeof r.code !== "number" ||
      r.code === 0 ||
      r.code === 200
  );

  if (!res.ok || !okBody) {
    console.error(
      `Failed to tag ${name}@${version} as latest: HTTP ${res.status}`,
      JSON.stringify(json)
    );
    process.exit(1);
  }

  console.log(`Tagged ${name}@${version} as latest`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
