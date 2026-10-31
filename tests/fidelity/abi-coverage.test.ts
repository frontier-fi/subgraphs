import { describe, expect, it } from "vitest";
import {
  eventNamesFromAbi,
  handlersFromTemplate,
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
