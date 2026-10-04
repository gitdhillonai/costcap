// Minimal read-only MCP JSON-RPC over stdio. No remote bind or spend effects.
import { createInterface } from "node:readline";
import { checkBudget } from "./check.js";
export function handleMcp(message, options) {
  const id = message.id;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") return { jsonrpc: "2.0", id: id ?? null, error: { code: -32600, message: "Invalid request" } };
  if (id === undefined) return null;
  const result = (value) => ({ jsonrpc: "2.0", id, result: value });
  if (message.method === "initialize") return result({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "costcap", version: "0.0.1" }, instructions: "Read-only estimated budget status for the configured local receipt ledger. Not a billing guarantee." });
  if (message.method === "ping") return result({});
  if (message.method === "tools/list") return result({ tools: [{ name: "budget_status", description: "Read configured local receipts and estimated spend. Cannot change caps or authorize paid calls.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }] });
  if (message.method === "tools/call" && message.params?.name === "budget_status") {
    try { return result({ content: [{ type: "text", text: JSON.stringify(checkBudget(options)) }], isError: false }); }
    catch (err) { return result({ content: [{ type: "text", text: err.message }], isError: true }); }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
}
export function serveMcp(options) {
  const lines = createInterface({ input: process.stdin });
  lines.on("line", (line) => {
    let reply;
    try { reply = handleMcp(JSON.parse(line), options); }
    catch { reply = { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }; }
    if (reply) process.stdout.write(JSON.stringify(reply) + "\n");
  });
  return lines;
}
