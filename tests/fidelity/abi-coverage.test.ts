import { describe, expect, it } from "vitest";
import {
  eventNamesFromAbi,
  extractFunction,
  handlersFromTemplate,
  readRepo,
} from "./helpers/source";

/** ERC20 / unused Vault noise that does not need indexing for fidelity. */
const VAULT_OK_TO_SKIP = new Set([
  "Approval",
  "Transfer",
  "VaultAuxiliary",
  "VaultQueriesDisabled",
  "VaultQueriesEnabled",
  "PoolInitialized", // may remain inferred from LiquidityAdded
]);

describe("ABI ↔ template handler coverage", () => {
  it("indexes fidelity-relevant Vault events", () => {
    const abiEvents = eventNamesFromAbi("subgraphs/vault/abis/Vault.json");
    const handled = handlersFromTemplate("subgraphs/vault/template.yaml");
    const missing = abiEvents.filter(
      (e) => !handled.has(e) && !VAULT_OK_TO_SKIP.has(e)
    );
    expect(missing).toEqual([]);
  });

  it("indexes all ProtocolFeeController events", () => {
    const abiEvents = eventNamesFromAbi(
      "subgraphs/vault/abis/ProtocolFeeController.json"
    );
    const handled = handlersFromTemplate("subgraphs/vault/template.yaml");
    const missing = abiEvents.filter((e) => !handled.has(e));
    expect(missing).toEqual([]);
  });

  it("indexes StablePool amp update events", () => {
    const template = handlersFromTemplate("subgraphs/pools/template.yaml");
    expect(template.has("AmpUpdateStarted")).toBe(true);
    expect(template.has("AmpUpdateStopped")).toBe(true);
  });

  it("AmpUpdateStarted persists ramp schedule fields", () => {
    const body = extractFunction(
      readRepo("subgraphs/pools/src/mappings/amp.ts"),
      "handleAmpUpdateStarted"
    )!;
    expect(body).toMatch(/ampIsUpdating\s*=\s*true/);
    expect(body).toMatch(
      /ampStartValue\s*=\s*event\.params\.startValue\.div\(\s*precision\s*\)/
    );
    expect(body).toMatch(
      /ampEndValue\s*=\s*event\.params\.endValue\.div\(\s*precision\s*\)/
    );
    expect(body).toMatch(/ampStartTime\s*=\s*event\.params\.startTime/);
    expect(body).toMatch(/ampEndTime\s*=\s*event\.params\.endTime/);
  });

  it("BufferShares mint and burn use the same BufferShare id scheme", () => {
    const src = readRepo("subgraphs/vault/src/mappings/vault.ts");
    const mint = extractFunction(src, "handleBufferSharesMinted")!;
    const burn = extractFunction(src, "handleBufferSharesBurned")!;
    expect(mint).toMatch(/buffer\.id\.concat\(\s*event\.params\.to\s*\)/);
    expect(burn).toMatch(/buffer\.id\.concat\(\s*event\.params\.from\s*\)/);
  });

  it("keeps core vault lifecycle events wired", () => {
    const handled = handlersFromTemplate("subgraphs/vault/template.yaml");
    for (const required of [
      "PoolRegistered",
      "LiquidityAdded",
      "LiquidityRemoved",
      "Swap",
      "SwapFeePercentageChanged",
      "Wrap",
      "Unwrap",
      "BufferSharesMinted",
      "BufferSharesBurned",
      "ProtocolFeeControllerChanged",
    ]) {
      expect(handled.has(required), required).toBe(true);
    }
  });
});
