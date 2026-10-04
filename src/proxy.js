// Local, post-response metering. Only proxy-routed traffic is covered.
// Requests are serialized per proxy, so the next decision sees prior usage.
// A request already accepted by a provider can exceed the remaining budget.
import http from "node:http";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { costForUsage } from "./pricing.js";
import { budgetExceededBody } from "./cap.js";
import { createSpiralDetector } from "./spiral.js";

const PROVIDERS = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  openrouter: "https://openrouter.ai/api",
  gemini: "https://generativelanguage.googleapis.com",
};

export function baseUrlOverrides(port, providers = Object.keys(PROVIDERS)) {
  const lines = [];
  if (providers.includes("openai")) lines.push(`OPENAI_BASE_URL=http://127.0.0.1:${port}/openai/v1`);
  if (providers.includes("anthropic")) lines.push(`ANTHROPIC_BASE_URL=http://127.0.0.1:${port}/anthropic`);
  if (providers.includes("openrouter")) lines.push(`OPENROUTER_BASE_URL=http://127.0.0.1:${port}/openrouter`);
  if (providers.includes("gemini")) lines.push(`GEMINI_BASE_URL=http://127.0.0.1:${port}/gemini`);
  return lines;
}

export function extractUsage(provider, text, requestedModel) {
  let chunks;
  try { const parsed = JSON.parse(text); chunks = Array.isArray(parsed) ? parsed : [parsed]; }
  catch {
    chunks = text.split("\n").filter((line) => line.startsWith("data:")).flatMap((line) => {
      try { return [JSON.parse(line.slice(5).trim())]; } catch { return []; }
    });
  }
  let model = requestedModel ?? "unknown";
  let usage = {};
  for (const chunk of chunks) {
    if (chunk.model || chunk.modelVersion || chunk.message?.model) model = chunk.model ?? chunk.modelVersion ?? chunk.message.model;
    if (provider === "gemini") {
      const u = chunk.usageMetadata;
      if (u) usage = { input_tokens: (u.promptTokenCount ?? 0) - (u.cachedContentTokenCount ?? 0),
        cached_input_tokens: u.cachedContentTokenCount ?? 0,
        output_tokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) };
    } else if (provider === "anthropic") {
      // message_start contains input usage; message_delta carries final output.
      const u = chunk.usage ?? chunk.message?.usage;
      if (u) {
        if (u.input_tokens != null) usage.input_tokens = u.input_tokens + (u.cache_creation_input_tokens ?? 0);
        if (u.output_tokens != null) usage.output_tokens = u.output_tokens;
        if (u.cache_read_input_tokens != null) usage.cached_input_tokens = u.cache_read_input_tokens;
      }
    } else {
      const u = chunk.usage;
      if (u) usage = { input_tokens: (u.prompt_tokens ?? u.input_tokens ?? 0) - (u.prompt_tokens_details?.cached_tokens ?? u.input_tokens_details?.cached_tokens ?? 0),
        output_tokens: u.completion_tokens ?? u.output_tokens ?? 0,
        cached_input_tokens: u.prompt_tokens_details?.cached_tokens ?? u.input_tokens_details?.cached_tokens ?? 0 };
    }
  }
  if (!Object.keys(usage).length) return null;
  for (const value of Object.values(usage)) if (!Number.isFinite(value) || value < 0) return null;
  return { model, usage };
}

export function createMeteringProxy({ receiptsPath, upstreams = PROVIDERS, onReceipt, cap,
  spiral = createSpiralDetector(), velocity, killCheck, timeoutMs = 60_000, maxBodyBytes = 2_000_000 } = {}) {
  if (receiptsPath) mkdirSync(dirname(receiptsPath), { recursive: true });
  let queue = Promise.resolve();
  let accountingFailure = null;
  const emit = (receipt) => {
    const complete = { id: randomUUID(), ts: new Date().toISOString(), ...receipt };
    // Persist before invoking integrations. Callback failures must not break metering.
    if (receiptsPath) appendFileSync(receiptsPath, JSON.stringify(complete) + "\n", { mode: 0o600 });
    try { Promise.resolve(onReceipt?.(complete)).catch(() => {}); } catch { /* delivery is outside the local ledger */ }
    return complete;
  };
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const [, provider, ...rest] = url.pathname.split("/");
    const upstream = upstreams[provider];
    const send = (status, body) => { if (!res.writableEnded && !res.destroyed) res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body)); };
    if (!upstream || !rest.length) { send(404, { error: "unknown provider path" }); return; }
    const chunks = [];
    let size = 0, tooLarge = false;
    req.on("data", (chunk) => { size += chunk.length; if (size > maxBodyBytes) { tooLarge = true; chunks.length = 0; } else if (!tooLarge) chunks.push(chunk); });
    req.on("error", () => {});
    req.on("end", () => {
      if (tooLarge) { send(413, { error: "request_too_large" }); return; }
      const body = Buffer.concat(chunks);
      const run = async () => {
        if (res.destroyed) return;
        const path = `/${rest.join("/")}${url.search}`;
        const block = (reason, detail, response) => {
          emit({ provider, path, blocked: true, reason, cost_usd: 0, ...detail });
          send(429, response);
        };
        const killed = killCheck?.();
        if (killed) return block("killed", killed, { error: "killed", ...killed });
        if (accountingFailure) return block("accounting_unavailable", {}, { error: "accounting_unavailable", message: accountingFailure });
        const hit = cap?.check();
        if (hit) return block("budget_exceeded", hit, budgetExceededBody(hit));
        const vhit = velocity?.check();
        if (vhit) return block(vhit.reason, vhit, { error: "breaker_open", ...vhit });
        const spiralHit = spiral?.observe(req.method, path, body.toString("utf8"));
        if (spiralHit) return block("spiral_detected", spiralHit, { error: "spiral_detected", ...spiralHit });
        const headers = { ...req.headers };
        for (const key of ["host", "content-length", "connection", "transfer-encoding", "accept-encoding"]) delete headers[key];
        let requestedModel;
        try { requestedModel = JSON.parse(body).model; } catch { /* provider handles malformed JSON */ }
        if (!requestedModel && provider === "gemini") requestedModel = /models\/([^/:]+)/.exec(path)?.[1];
        try {
          const upstreamRes = await fetch(`${upstream}${path}`, { method: req.method, headers,
            body: ["GET", "HEAD"].includes(req.method) ? undefined : body, signal: AbortSignal.timeout(timeoutMs) });
          // Buffered SSE preserves data but is not real-time streaming.
          const raw = Buffer.from(await upstreamRes.arrayBuffer());
          const metered = extractUsage(provider, raw.toString("utf8"), requestedModel);
          const receipt = { provider, path: url.pathname.replace(`/${provider}`, ""), status: upstreamRes.status, blocked: false };
          if (metered) {
            Object.assign(receipt, costForUsage(metered.model, metered.usage));
            cap?.record(receipt);
            velocity?.record(receipt.cost_usd);
          } else {
            // Unknown spend is never silently free. Stop subsequent calls.
            Object.assign(receipt, { model: requestedModel ?? "unknown", cost_usd: null, reason: "usage_unavailable" });
            accountingFailure = "Provider returned no usable token usage. Restart only after reconciling this request.";
            velocity?.record(0);
          }
          emit(receipt);
          if (!res.destroyed) res.writeHead(upstreamRes.status, { "content-type": upstreamRes.headers.get("content-type") ?? "application/json" }).end(raw);
        } catch {
          // A failed fetch may already have billed upstream. Do not assume zero.
          accountingFailure = "Upstream outcome or receipt persistence is uncertain. Reconcile before restarting.";
          try { emit({ provider, path, blocked: false, cost_usd: null, reason: "upstream_outcome_unknown" }); } catch { /* stop on broken ledger */ }
          send(502, { error: "upstream_outcome_unknown" });
        }
      };
      queue = queue.then(run).catch(() => { accountingFailure = "Receipt ledger unavailable."; send(503, { error: "receipt_ledger_unavailable" }); });
    });
  });
}

export function startMeteringProxy(opts = {}, port = 0) {
  const server = createMeteringProxy(opts);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}
