#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ACCOUNT_ID = "9298290c-99e5-4994-b44f-d1c4ec424e0d";
const BASE_URL = "https://api.subgraph.ormilabs.com";

const file = path.resolve(__dirname, "../deployments.json");
const [name, subgraph, network, version, deploymentId] = process.argv.slice(2);

if (!name || !subgraph || !network || !version) {
  console.error(
    "usage: record-deployment.js <name> <subgraph> <network> <version> [deploymentId]"
  );
  process.exit(1);
}

const id = deploymentId || null;
const entry = {
  name,
  subgraph,
  network,
  version,
  deploymentId: id,
  queries: id
    ? `${BASE_URL}/api/public/query_deployment?subgraph_id=${id}`
    : null,
  endpoint: `${BASE_URL}/api/public/${ACCOUNT_ID}/subgraphs/${name}/${version}/gn`,
  endpointLatest: `${BASE_URL}/api/public/${ACCOUNT_ID}/subgraphs/${name}/latest/gn`,
  ipfs: id ? `${BASE_URL}/api/subgraph/ipfs/cat?arg=${id}` : null,
  deployedAt: new Date().toISOString(),
};

let data = {};
if (fs.existsSync(file)) {
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    // start fresh if corrupt
  }
}
if (!data || typeof data !== "object" || Array.isArray(data)) data = {};

data[name] = entry;

fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log(`Recorded ${name}`);
if (entry.endpoint) console.log(`  endpoint: ${entry.endpoint}`);
if (entry.queries) console.log(`  queries:  ${entry.queries}`);
