#!/usr/bin/env node
/**
 * Point an Ormi tag at a deployed subgraph version via create-tag.
 * Default tag is "latest" (stable …/subgraphs/{name}/latest/gn URL).
 *
 * Live API path is /api/private/... (docs' /public_api/... 404s).
 */
const BASE_URL = "https://api.subgraph.ormilabs.com";

const [name, version, tag = "latest"] = process.argv.slice(2);
const deployKey = process.env.ORMI_DEPLOY_KEY;

if (!name || !version) {
  console.error("usage: tag-latest.js <subgraph-name> <version> [tag]");
  process.exit(1);
}
if (!deployKey) {
  console.error("ORMI_DEPLOY_KEY is not set");
  process.exit(1);
}

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deployKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json, text };
}

function responseOk(json) {
  const entries = Array.isArray(json) ? json : [json];
  return entries.every((r) => {
    if (!r || typeof r !== "object") return true;
    if (typeof r.code !== "number") return true;
    // Ormi success codes observed / documented
    return r.code === 0 || r.code === 200;
  });
}

async function main() {
  const payload = { subgraph_name: name, version, tag };

  const create = await post(
    "/api/private/v1/0xGraph/tags/create-tag",
    payload
  );
  console.log(
    `create-tag HTTP ${create.status}: ${JSON.stringify(create.json)}`
  );

  if (!create.ok || !responseOk(create.json)) {
    console.error(`Failed to tag ${name}@${version} as ${tag}`);
    process.exit(1);
  }

  const query = await post("/api/private/v1/0xGraph/tags/query-tag", {
    subgraph_name: name,
    version,
  });
  console.log(
    `query-tag HTTP ${query.status}: ${JSON.stringify(query.json)}`
  );

  console.log(`Tagged ${name}@${version} as ${tag}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
