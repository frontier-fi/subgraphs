import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJson, repoRoot } from "./helpers/source";

const CONSTANTS = "subgraphs/vault/src/helpers/constants.ts";
const ARBITRUM_VAULT = "0x00000000000000000000000000000000000000AA";

let workDir: string | null = null;

afterEach(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
  workDir = null;
});

/** Copy the generator and its templates into a scratch dir with the given networks.json. */
function scratchRepo(networks: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "generate-manifests-"));
  for (const rel of [
    "scripts/generate-manifests.js",
    "subgraphs/vault/template.yaml",
    "subgraphs/pools/template.yaml",
    "subgraphs/vault/src/helpers/constants.template.ts",
  ]) {
    cpSync(join(repoRoot(), rel), join(dir, rel), { recursive: true });
  }
  writeFileSync(join(dir, "networks.json"), JSON.stringify(networks));
  workDir = dir;
  return dir;
}

function generate(dir: string, env: Record<string, string> = {}): void {
  execFileSync("node", ["scripts/generate-manifests.js"], {
    cwd: dir,
    stdio: "pipe",
    env: { ...process.env, ...env },
  });
}

function twoNonSepoliaNetworks(): Record<string, unknown> {
  const sepolia = readJson<Record<string, any>>("networks.json").sepolia;
  return {
    mainnet: sepolia,
    arbitrum: { ...sepolia, Vault: { ...sepolia.Vault, address: ARBITRUM_VAULT } },
  };
}

describe("Manifest generation", () => {
  it("writes a manifest per network", () => {
    const dir = scratchRepo(twoNonSepoliaNetworks());
    generate(dir);
    for (const subgraph of ["vault", "pools"]) {
      for (const network of ["mainnet", "arbitrum"]) {
        expect(existsSync(join(dir, `subgraphs/${subgraph}/subgraph.${network}.yaml`))).toBe(true);
      }
    }
  });

  it("skips constants.ts instead of throwing when the network is ambiguous", () => {
    const dir = scratchRepo(twoNonSepoliaNetworks());
    generate(dir);
    expect(existsSync(join(dir, CONSTANTS))).toBe(false);
  });

  it("writes the selected network's Vault address with GENERATE_NETWORK", () => {
    const dir = scratchRepo(twoNonSepoliaNetworks());
    generate(dir, { GENERATE_NETWORK: "arbitrum" });
    expect(readFileSync(join(dir, CONSTANTS), "utf8")).toContain(ARBITRUM_VAULT);
  });

  it("rejects a GENERATE_NETWORK missing from networks.json", () => {
    const dir = scratchRepo(twoNonSepoliaNetworks());
    expect(() => generate(dir, { GENERATE_NETWORK: "base" })).toThrow();
  });
});
