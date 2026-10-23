#!/usr/bin/env node
/**
 * Point an Ormi tag at a deployed subgraph version via create-tag.
 * Default tag is "latest" (stable …/subgraphs/{name}/latest/gn URL).
 *
 * Docs list /public_api/v1/0xGraph/tags/... but that 404s.
 * Live routes:
 *   POST /api/private/v1/0xGraph/tags/create-tag|delete-tag|query-tag
 * Auth: Authorization: Bearer <apiKey>
 */
const BASE_URL = "https://api.subgraph.ormilabs.com";
const CREATE_PATH = "/api/private/v1/0xGraph/tags/create-tag";
const QUERY_PATH = "/api/private/v1/0xGraph/tags/query-tag";

const [name, version, tag = "latest"] = process.argv.slice(2);
const apiKey = process.env.ORMI_DEPLOY_KEY;

if (!name || !version) {
  console.error("usage: tag-latest.js <subgraph-name> <version> [tag]");
  process.exit(1);
}
if (!apiKey) {
  console.error("ORMI_DEPLOY_KEY is not set");
  process.exit(1);
}

async function post(path, body) {
  const url = `${BASE_URL}${path}`;
  console.log(`POST ${url}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json, text, url };
}

function responseOk(json) {
  if (!json || typeof json !== "object") return false;
  if (json.error) return false;
  if (json.raw !== undefined && json.raw === "") return false;

  const entries = Array.isArray(json) ? json : [json];
  return entries.every((r) => {
    if (!r || typeof r !== "object") return false;
    if (r.error) return false;
    if (typeof r.code !== "number") return false;
    return r.code === 0 || r.code === 200;
  });
}

async function main() {
  const payload = { subgraph_name: name, version, tag };

  const create = await post(CREATE_PATH, payload);
  console.log(
    `create-tag HTTP ${create.status}: ${JSON.stringify(create.json)}`
  );

  if (!create.ok || !responseOk(create.json)) {
    console.error(`Failed to tag ${name}@${version} as ${tag}`);
    process.exit(1);
  }

  const query = await post(QUERY_PATH, {
    subgraph_name: name,
    version,
  });
  console.log(`query-tag HTTP ${query.status}: ${JSON.stringify(query.json)}`);

  console.log(`Tagged ${name}@${version} as ${tag}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
