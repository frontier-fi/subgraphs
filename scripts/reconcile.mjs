#!/usr/bin/env node
/**
 * Reconcile the vault and pools subgraphs against the chain at one block.
 *
 *   RPC_URL=... VAULT_SUBGRAPH_URL=... POOLS_SUBGRAPH_URL=... pnpm reconcile
 *
 * Every subgraph value is read at the block both subgraphs have indexed, and
 * compared with the contract view at that same block. Each check is one of:
 *
 *   fact     - stored from events or read from chain; must match exactly
 *   snapshot - read from chain only on pool events, so it can lag the chain
 *              (priceRate, amp during or after a ramp)
 *   model    - computed by the subgraph (fee attribution); may drift by dust
 *
 * Exits 1 when a fact mismatches (or any check with --strict).
 * Options: --block <n>, --json <path>, --strict, --tolerance <raw units>.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, getAddress, http, parseAbi } from "viem";
import { graphqlAll, indexedBlock, rawMatches, toRaw } from "./reconcile/lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

const abi = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const VAULT_ABI = [
  ...abi("subgraphs/vault/abis/VaultExtension.json").filter((x) => x.type === "function"),
  // VaultAdmin views, reached through the Vault (25d73b3d).
  ...parseAbi([
    "function isVaultPaused() view returns (bool)",
    "function areBuffersPaused() view returns (bool)",
    "function getBufferBalance(address token) view returns (uint256 underlying, uint256 wrapped)",
    "function getBufferTotalShares(address token) view returns (uint256)",
    "function getBufferOwnerShares(address token, address user) view returns (uint256)",
  ]),
];
const CONTROLLER_ABI = abi("subgraphs/vault/abis/ProtocolFeeController.json");
const ERC20_ABI = abi("subgraphs/vault/abis/ERC20.json");
const STABLE_ABI = abi("subgraphs/pools/abis/StablePool.json");
const WEIGHTED_ABI = abi("subgraphs/pools/abis/WeightedPool.json");

function parseArgs(argv) {
  const options = { strict: false, tolerance: 1000n, block: null, json: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--strict") options.strict = true;
    else if (arg === "--block") options.block = Number(argv[++i]);
    else if (arg === "--json") options.json = argv[++i];
    else if (arg === "--tolerance") options.tolerance = BigInt(argv[++i]);
    else throw new Error(`unknown argument ${arg}`);
  }
  return options;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

class Report {
  constructor(tolerance) {
    this.tolerance = tolerance;
    this.counts = new Map(); // "kind entity.field" -> { checked, mismatched }
    this.mismatches = [];
  }

  record(kind, entity, field, id, subgraph, chain, ok) {
    const key = `${kind} ${entity}.${field}`;
    const count = this.counts.get(key) ?? { checked: 0, mismatched: 0 };
    count.checked++;
    if (!ok) {
      count.mismatched++;
      this.mismatches.push({ kind, entity, field, id, subgraph: String(subgraph), chain: String(chain) });
    }
    this.counts.set(key, count);
  }

  /** Compare a subgraph BigDecimal with a raw chain integer at `decimals`. */
  decimal(kind, entity, field, id, subgraphValue, chainRaw, decimals) {
    const { raw } = toRaw(subgraphValue, decimals);
    const tolerance = kind === "model" ? this.tolerance : 0n;
    this.record(kind, entity, field, id, raw, chainRaw, rawMatches(raw, BigInt(chainRaw), tolerance));
  }

  equal(kind, entity, field, id, subgraphValue, chainValue) {
    const a = typeof subgraphValue === "string" ? subgraphValue.toLowerCase() : subgraphValue;
    const b = typeof chainValue === "string" ? chainValue.toLowerCase() : chainValue;
    this.record(kind, entity, field, id, subgraphValue, chainValue, a === b);
  }

  failed(kind) {
    return this.mismatches.some((m) => m.kind === kind);
  }
}

/** Run contract reads in one multicall at `blockNumber`; failed calls come back as null. */
async function readAll(client, blockNumber, contracts) {
  if (contracts.length === 0) return [];
  const results = await client.multicall({
    contracts,
    blockNumber,
    allowFailure: true,
    multicallAddress: MULTICALL3,
    batchSize: 2048,
  });
  return results.map((r) => (r.status === "success" ? r.result : null));
}

async function reconcileVault(client, url, block, report) {
  const blockNumber = BigInt(block);
  const vaultAddress = getAddress(
    JSON.parse(readFileSync(join(ROOT, "networks.json"), "utf8"))[
      process.env.NETWORK ?? "sepolia"
    ].Vault.address
  );
  const vault = { address: vaultAddress, abi: VAULT_ABI };

  // Vault-level state.
  const [authorizer, controllerAddress, isPaused, buffersPaused] = await readAll(client, blockNumber, [
    { ...vault, functionName: "getAuthorizer" },
    { ...vault, functionName: "getProtocolFeeController" },
    { ...vault, functionName: "isVaultPaused" },
    { ...vault, functionName: "areBuffersPaused" },
  ]);
  const controller = { address: controllerAddress, abi: CONTROLLER_ABI };
  const [globalSwap, globalYield] = await readAll(client, blockNumber, [
    { ...controller, functionName: "getGlobalProtocolSwapFeePercentage" },
    { ...controller, functionName: "getGlobalProtocolYieldFeePercentage" },
  ]);

  const vaults = await graphqlAll(
    url, "vaults", "authorizer protocolFeeController isPaused isBuffersPaused protocolSwapFee protocolYieldFee", block
  );
  for (const v of vaults) {
    report.equal("fact", "Vault", "authorizer", v.id, v.authorizer, authorizer);
    report.equal("fact", "Vault", "protocolFeeController", v.id, v.protocolFeeController, controllerAddress);
    report.equal("fact", "Vault", "isPaused", v.id, v.isPaused, isPaused);
    report.equal("fact", "Vault", "isBuffersPaused", v.id, v.isBuffersPaused, buffersPaused);
    report.decimal("fact", "Vault", "protocolSwapFee", v.id, v.protocolSwapFee, globalSwap, 18);
    report.decimal("fact", "Vault", "protocolYieldFee", v.id, v.protocolYieldFee, globalYield, 18);
  }

  // Pools and their tokens.
  const pools = await graphqlAll(
    url,
    "pools",
    `swapFee aggregateSwapFee aggregateYieldFee protocolSwapFee protocolYieldFee
     poolCreatorSwapFee poolCreatorYieldFee isInRecoveryMode isPaused isInitialized
     totalShares holdersCount
     tokens { address index decimals balance priceRate tokenType rateProvider paysYieldFees
       vaultProtocolSwapFeeBalance vaultCreatorSwapFeeBalance
       vaultProtocolYieldFeeBalance vaultCreatorYieldFeeBalance
       controllerProtocolFeeBalance controllerCreatorFeeBalance }`,
    block
  );

  for (const pool of pools) {
    const p = pool.id;
    const [config, tokenInfo, rates, totalSupply, protocolSwapInfo, protocolYieldInfo, creatorSwap, creatorYield,
      protocolAmounts, creatorAmounts] = await readAll(client, blockNumber, [
      { ...vault, functionName: "getPoolConfig", args: [p] },
      { ...vault, functionName: "getPoolTokenInfo", args: [p] },
      { ...vault, functionName: "getPoolTokenRates", args: [p] },
      { address: p, abi: ERC20_ABI, functionName: "totalSupply" },
      { ...controller, functionName: "getPoolProtocolSwapFeeInfo", args: [p] },
      { ...controller, functionName: "getPoolProtocolYieldFeeInfo", args: [p] },
      { ...controller, functionName: "getPoolCreatorSwapFeePercentage", args: [p] },
      { ...controller, functionName: "getPoolCreatorYieldFeePercentage", args: [p] },
      { ...controller, functionName: "getProtocolFeeAmounts", args: [p] },
      { ...controller, functionName: "getPoolCreatorFeeAmounts", args: [p] },
    ]);

    if (config) {
      report.decimal("fact", "Pool", "swapFee", p, pool.swapFee, config.staticSwapFeePercentage, 18);
      report.decimal("fact", "Pool", "aggregateSwapFee", p, pool.aggregateSwapFee, config.aggregateSwapFeePercentage, 18);
      report.decimal("fact", "Pool", "aggregateYieldFee", p, pool.aggregateYieldFee, config.aggregateYieldFeePercentage, 18);
      report.equal("fact", "Pool", "isInRecoveryMode", p, pool.isInRecoveryMode, config.isPoolInRecoveryMode);
      report.equal("fact", "Pool", "isPaused", p, pool.isPaused, config.isPoolPaused);
      report.equal("fact", "Pool", "isInitialized", p, pool.isInitialized, config.isPoolInitialized);
    }
    if (totalSupply !== null) report.decimal("fact", "Pool", "totalShares", p, pool.totalShares, totalSupply, 18);
    if (protocolSwapInfo) report.decimal("fact", "Pool", "protocolSwapFee", p, pool.protocolSwapFee, protocolSwapInfo[0], 18);
    if (protocolYieldInfo) report.decimal("fact", "Pool", "protocolYieldFee", p, pool.protocolYieldFee, protocolYieldInfo[0], 18);
    if (creatorSwap !== null) report.decimal("fact", "Pool", "poolCreatorSwapFee", p, pool.poolCreatorSwapFee, creatorSwap, 18);
    if (creatorYield !== null) report.decimal("fact", "Pool", "poolCreatorYieldFee", p, pool.poolCreatorYieldFee, creatorYield, 18);

    const pendingCalls = pool.tokens.flatMap((t) => [
      { ...vault, functionName: "getAggregateSwapFeeAmount", args: [p, t.address] },
      { ...vault, functionName: "getAggregateYieldFeeAmount", args: [p, t.address] },
    ]);
    const pending = await readAll(client, blockNumber, pendingCalls);

    pool.tokens.forEach((t, k) => {
      const id = `${p}/${t.address}`;
      const i = t.index;
      if (tokenInfo) {
        const [tokens, configs, balancesRaw] = tokenInfo;
        report.equal("fact", "PoolToken", "address", id, t.address, tokens[i]);
        report.equal("fact", "PoolToken", "tokenType", id, t.tokenType, configs[i].tokenType);
        report.equal("fact", "PoolToken", "rateProvider", id, t.rateProvider, configs[i].rateProvider);
        report.equal("fact", "PoolToken", "paysYieldFees", id, t.paysYieldFees, configs[i].paysYieldFees);
        report.decimal("fact", "PoolToken", "balance", id, t.balance, balancesRaw[i], t.decimals);
      }
      // Refreshed only on swaps and liquidity changes; rate providers move in between.
      if (rates) report.decimal("snapshot", "PoolToken", "priceRate", id, t.priceRate, rates[1][i], 18);

      // The subgraph splits pending fees protocol/creator; the Vault holds one aggregate.
      const [swapPending, yieldPending] = [pending[2 * k], pending[2 * k + 1]];
      const sum = (a, b) => (toRaw(a, t.decimals).raw + toRaw(b, t.decimals).raw).toString();
      if (swapPending !== null) {
        report.decimal("model", "PoolToken", "vaultSwapFeePending", id,
          sum(t.vaultProtocolSwapFeeBalance, t.vaultCreatorSwapFeeBalance), swapPending, 0);
      }
      if (yieldPending !== null) {
        report.decimal("model", "PoolToken", "vaultYieldFeePending", id,
          sum(t.vaultProtocolYieldFeeBalance, t.vaultCreatorYieldFeeBalance), yieldPending, 0);
      }
      if (protocolAmounts) {
        report.decimal("model", "PoolToken", "controllerProtocolFeeBalance", id,
          t.controllerProtocolFeeBalance, protocolAmounts[i], t.decimals);
      }
      if (creatorAmounts) {
        report.decimal("model", "PoolToken", "controllerCreatorFeeBalance", id,
          t.controllerCreatorFeeBalance, creatorAmounts[i], t.decimals);
      }
    });
  }

  // BPT holders.
  const shares = await graphqlAll(url, "poolShares", "pool { id } user balance", block, "String");
  const shareBalances = await readAll(client, blockNumber,
    shares.map((s) => ({ address: s.pool.id, abi: ERC20_ABI, functionName: "balanceOf", args: [s.user] })));
  const holders = new Map();
  shares.forEach((s, k) => {
    if (shareBalances[k] !== null) report.decimal("fact", "PoolShare", "balance", s.id, s.balance, shareBalances[k], 18);
    if (toRaw(s.balance, 18).raw > 0n) holders.set(s.pool.id, (holders.get(s.pool.id) ?? 0) + 1);
  });
  for (const pool of pools) {
    report.equal("fact", "Pool", "holdersCount", pool.id, Number(pool.holdersCount), holders.get(pool.id) ?? 0);
  }

  // Buffers.
  const buffers = await graphqlAll(url, "buffers",
    "wrappedToken { decimals } underlyingToken { decimals } wrappedBalance underlyingBalance totalShares", block);
  for (const b of buffers) {
    const [balance, totalShares] = await readAll(client, blockNumber, [
      { ...vault, functionName: "getBufferBalance", args: [b.id] },
      { ...vault, functionName: "getBufferTotalShares", args: [b.id] },
    ]);
    if (balance) {
      report.decimal("fact", "Buffer", "underlyingBalance", b.id, b.underlyingBalance, balance[0], b.underlyingToken.decimals);
      report.decimal("fact", "Buffer", "wrappedBalance", b.id, b.wrappedBalance, balance[1], b.wrappedToken.decimals);
    }
    if (totalShares !== null) {
      report.decimal("fact", "Buffer", "totalShares", b.id, b.totalShares, totalShares, b.wrappedToken.decimals);
    }
  }
  const bufferShares = await graphqlAll(url, "bufferShares", "user balance buffer { id wrappedToken { decimals } }", block);
  const ownerShares = await readAll(client, blockNumber, bufferShares.map((s) => ({
    ...vault, functionName: "getBufferOwnerShares", args: [s.buffer.id, s.user],
  })));
  bufferShares.forEach((s, k) => {
    if (ownerShares[k] !== null) {
      report.decimal("fact", "BufferShare", "balance", s.id, s.balance, ownerShares[k], s.buffer.wrappedToken.decimals);
    }
  });
}

async function reconcilePools(client, url, block, report) {
  const blockNumber = BigInt(block);
  const pools = await graphqlAll(url, "pools", "stableParams { amp ampIsUpdating } weightedParams { weights }", block);

  const stable = pools.filter((p) => p.stableParams);
  const amps = await readAll(client, blockNumber, stable.map((p) => ({
    address: p.id, abi: STABLE_ABI, functionName: "getAmplificationParameter",
  })));
  stable.forEach((p, k) => {
    if (!amps[k]) return;
    const [value, isUpdating, precision] = amps[k];
    // amp is stored as an integer (value / precision) and refreshed only on amp
    // events, so it is a snapshot while a ramp runs or after one ends on its own.
    const ramping = p.stableParams.ampIsUpdating || isUpdating;
    report.equal(ramping ? "snapshot" : "fact", "StableParams", "amp", p.id,
      String(p.stableParams.amp), String(value / precision));
    report.equal("snapshot", "StableParams", "ampIsUpdating", p.id, p.stableParams.ampIsUpdating, isUpdating);
  });

  const weighted = pools.filter((p) => p.weightedParams);
  const weights = await readAll(client, blockNumber, weighted.map((p) => ({
    address: p.id, abi: WEIGHTED_ABI, functionName: "getNormalizedWeights",
  })));
  weighted.forEach((p, k) => {
    if (!weights[k]) return;
    weights[k].forEach((w, i) => {
      report.decimal("fact", "WeightedParams", "weights", `${p.id}[${i}]`, p.weightedParams.weights[i], w, 18);
    });
  });
}

function printReport(report, block) {
  console.log(`Reconciled at block ${block}\n`);
  const rows = [...report.counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [key, { checked, mismatched }] of rows) {
    const status = mismatched === 0 ? "ok  " : "FAIL";
    console.log(`${status} ${key.padEnd(52)} ${String(mismatched).padStart(5)} / ${checked}`);
  }
  if (report.mismatches.length > 0) {
    console.log(`\nFirst mismatches:`);
    for (const m of report.mismatches.slice(0, 25)) {
      console.log(`  [${m.kind}] ${m.entity}.${m.field} ${m.id}: subgraph ${m.subgraph}, chain ${m.chain}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = createPublicClient({ transport: http(requireEnv("RPC_URL"), { batch: true }) });
  const vaultUrl = requireEnv("VAULT_SUBGRAPH_URL");
  const poolsUrl = requireEnv("POOLS_SUBGRAPH_URL");

  const [vaultMeta, poolsMeta] = await Promise.all([indexedBlock(vaultUrl), indexedBlock(poolsUrl)]);
  for (const [name, meta] of [["vault", vaultMeta], ["pools", poolsMeta]]) {
    if (meta.hasIndexingErrors) console.warn(`warning: ${name} subgraph has indexing errors`);
  }
  // Both subgraphs must be read at a block they have both indexed.
  const block = options.block ?? Math.min(vaultMeta.block, poolsMeta.block);

  const report = new Report(options.tolerance);
  await reconcileVault(client, vaultUrl, block, report);
  await reconcilePools(client, poolsUrl, block, report);

  printReport(report, block);
  if (options.json) {
    writeFileSync(options.json, JSON.stringify({
      block,
      counts: Object.fromEntries(report.counts),
      mismatches: report.mismatches,
    }, null, 2));
  }

  const failed = report.failed("fact") ||
    (options.strict && (report.failed("snapshot") || report.failed("model")));
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
