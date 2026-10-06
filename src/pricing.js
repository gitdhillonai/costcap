// Versioned model pricing with a declared fallback rate.
// Unknown models bill at the fallback (the highest known rate), never free.
// The table version is returned with every lookup so receipts can pin it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const tablePath = fileURLToPath(new URL("./pricing-table.json", import.meta.url));
const table = JSON.parse(readFileSync(tablePath, "utf8"));

export const TABLE_VERSION = table.version;

export function lookupPrice(model) {
  // OpenAI returns dated snapshot ids (gpt-4o-mini-2024-07-18); price them as their base model.
  const base = typeof model === "string" ? model.replace(/-\d{4}-\d{2}-\d{2}$/, "") : model;
  const entry = table.models[model] ?? table.models[base];
  if (entry) return { model, ...entry, table_version: table.version, fallback: false };
  return { model, ...table.fallback, table_version: table.version, fallback: true };
}

export function costForUsage(model, { input_tokens = 0, output_tokens = 0, cached_input_tokens = 0 } = {}) {
  const price = lookupPrice(model);
  const cost =
    (input_tokens * price.input +
      cached_input_tokens * price.cached_input +
      output_tokens * price.output) / 1_000_000;
  return {
    model,
    cost_usd: Number(cost.toFixed(6)),
    input_tokens,
    output_tokens,
    cached_input_tokens,
    table_version: price.table_version,
    fallback: price.fallback,
  };
}
