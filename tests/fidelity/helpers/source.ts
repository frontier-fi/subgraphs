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

/** Pull a contiguous function body by matching braces from `function name` (export optional). */
export function extractFunction(source: string, name: string): string | null {
  const start = source.search(
    new RegExp(`(?:export\\s+)?function ${name}\\s*\\(`)
  );
  if (start < 0) return null;

  const braceStart = source.indexOf("{", start);
  if (braceStart < 0) return null;

  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
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

export function schemaFields(entity: string, schemaRel: string): string[] {
  const schema = readRepo(schemaRel);
  const re = new RegExp(`type ${entity}[^{]*\\{([\\s\\S]*?)\\n\\}`, "m");
  const m = schema.match(re);
  if (!m) return [];
  const body = m[1];
  const fields: string[] = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('"') || trimmed.startsWith("#")) continue;
    const fm = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (fm) fields.push(fm[1]);
  }
  return fields;
}

/** True if a GraphQL field appears as an assignment target in mappings (best-effort). */
export function fieldAssignedInSources(
  field: string,
  sources: string[]
): boolean {
  const patterns = [
    new RegExp(`\\.${field}\\s*=`),
    new RegExp(`${field}:`), // struct-ish unlikely
  ];
  return sources.some((src) => patterns.some((p) => p.test(src)));
}
