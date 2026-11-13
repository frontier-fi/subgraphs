/**
 * Pure helpers for scripts/reconcile.mjs: decimal conversion, comparison and
 * paginated GraphQL reads pinned to one block.
 */

/**
 * Convert a subgraph BigDecimal string to a raw integer with `decimals` places.
 * Digits past `decimals` are truncated and reported, so a modelled field that
 * carries more precision than the token still compares at token precision.
 */
export function toRaw(value, decimals) {
  let text = String(value).trim();
  let negative = text.startsWith("-");
  if (negative || text.startsWith("+")) text = text.slice(1);

  let exponent = 0;
  const e = text.search(/e/i);
  if (e >= 0) {
    exponent = Number(text.slice(e + 1));
    text = text.slice(0, e);
  }
  let [whole, fraction = ""] = text.split(".");
  let digits = (whole || "0") + fraction;
  let scale = fraction.length - exponent; // value = digits * 10^-scale

  let shift = decimals - scale;
  let truncated = false;
  let raw;
  if (shift >= 0) {
    raw = BigInt(digits) * 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    const full = BigInt(digits);
    raw = full / divisor;
    truncated = full % divisor !== 0n;
  }
  return { raw: negative ? -raw : raw, truncated };
}

/**
 * True when two raw integers agree. Facts must match exactly; modelled values
 * may differ by `tolerance` raw units (dust from BigDecimal vs Solidity
 * integer rounding).
 */
export function rawMatches(subgraph, chain, tolerance = 0n) {
  const diff = subgraph > chain ? subgraph - chain : chain - subgraph;
  return diff <= tolerance;
}

export async function graphql(url, query, variables) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body.errors) {
    throw new Error(`${url}: ${JSON.stringify(body.errors)}`);
  }
  return body.data;
}

/**
 * Read every row of `collection` at `block`, paging by id. `fields` is the
 * GraphQL selection; `idType` is the id's GraphQL type (Bytes or String).
 */
export async function graphqlAll(url, collection, fields, block, idType = "Bytes", where = "") {
  const query = `query($block: Int!, $last: ${idType}!) {
    rows: ${collection}(first: 1000, orderBy: id, block: { number: $block },
      where: { id_gt: $last ${where} }) { id ${fields} }
  }`;
  const rows = [];
  let last = idType === "Bytes" ? "0x" : "";
  for (;;) {
    const data = await graphql(url, query, { block, last });
    rows.push(...data.rows);
    if (data.rows.length < 1000) return rows;
    last = data.rows[data.rows.length - 1].id;
  }
}

export async function indexedBlock(url) {
  const data = await graphql(url, "{ _meta { block { number } hasIndexingErrors } }");
  return {
    block: data._meta.block.number,
    hasIndexingErrors: data._meta.hasIndexingErrors,
  };
}
