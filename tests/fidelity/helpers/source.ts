import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function repoRoot(): string {
  return ROOT;
}

export function readRepo(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

export function readJson<T>(relPath: string): T {
  return JSON.parse(readRepo(relPath)) as T;
}

export function extractAddressLiteral(source: string, binding: string): string | null {
  const re = new RegExp(
    `${binding}\\s*=\\s*Address\\.fromString\\(\\s*[\\n\\r\\s]*"([^"]+)"`,
    "m"
  );
  const m = source.match(re);
  return m ? m[1] : null;
}

export function eventNamesFromAbi(relPath: string): string[] {
  const abi = readJson<Array<{ type?: string; name?: string }>>(relPath);
  return abi
    .filter((e) => e.type === "event" && e.name)
    .map((e) => e.name as string)
    .sort();
}

export function handlersFromTemplate(relPath: string): Set<string> {
  const yaml = readRepo(relPath);
  const handlers = new Set<string>();
  const re = /-\s*event:\s*([A-Za-z0-9_]+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(yaml)) !== null) {
    handlers.add(m[1]);
  }
  return handlers;
}
