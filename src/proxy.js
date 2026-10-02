// Metering proxy: sits between the agent and the provider. Forwards every
// request upstream, extracts token usage from the response, computes cost
// from the versioned pricing table, and appends a JSON receipt.
//
// Honesty boundary: this meters only traffic that flows through the proxy.
// An agent that bypasses the proxy bypasses CostCap.

import http from "node:http";
import { appendFileSync } from "node:fs";
import { costForUsage } from "./pricing.js";
import { budgetExceededBody } from "./cap.js";
import { createSpiralDetector } from "./spiral.js";

const PROVIDERS = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  openrouter: "https://openrouter.ai/api",
  gemini: "https://generativelanguage.googleapis.com",
};

// Shell env lines to point an agent at this proxy.
export function baseUrlOverrides(port, providers = Object.keys(PROVIDERS)) {
  const lines = [];
  if (providers.includes("openai")) lines.push(`OPENAI_BASE_URL=http://127.0.0.1:${port}/openai/v1`);
  if (providers.includes("anthropic")) lines.push(`ANTHROPIC_BASE_URL=http://127.0.0.1:${port}/anthropic`);
  if (providers.includes("openrouter")) lines.push(`OPENROUTER_BASE_URL=http://127.0.0.1:${port}/openrouter`);
  if (providers.includes("gemini")) lines.push(`GEMINI_BASE_URL=http://127.0.0.1:${port}/gemini`);
  return lines;
}

function extractUsage(provider, body) {
  // OpenAI/OpenRouter chat shape; Anthropic messages shape.
  const usage = body?.usage;
  if (!usage) return null;
  if (provider === "anthropic") {
    return {
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cached_input_tokens: usage.cache_read_input_tokens ?? 0,
    };
  }
  return {
    input_tokens: (usage.prompt_tokens ?? 0) - (usage.prompt_tokens_details?.cached_tokens ?? 0),
    output_tokens: usage.completion_tokens ?? 0,
    cached_input_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

export function createMeteringProxy({ receiptsPath, upstreams = PROVIDERS, onReceipt, cap, spiral = createSpiralDetector(), velocity } = {}) {
  const server = http.createServer((req, res) => {
    const [, provider, ...rest] = req.url.split("/");
    const upstream = upstreams[provider];
    if (!upstream || !rest.length) {
      res.writeHead(404).end(JSON.stringify({ error: `unknown provider path ${req.url}` }));
      return;
    }
    // Hard stop: at the cap the upstream call never happens.
    const hit = cap?.check();
    if (hit) {
      res.writeHead(429, { "content-type": "application/json" }).end(JSON.stringify(budgetExceededBody(hit)));
      onReceipt?.({ ts: new Date().toISOString(), provider, blocked: true, cost_usd: 0, ...hit });
      return;
    }
    // Cost-velocity / step-budget breaker: latches until resume().
    const vhit = velocity?.check();
    if (vhit) {
      res.writeHead(429, { "content-type": "application/json" }).end(JSON.stringify({ error: "breaker_open", ...vhit }));
      onReceipt?.({ ts: new Date().toISOString(), provider, blocked: true, cost_usd: 0, ...vhit });
      return;
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const body = Buffer.concat(chunks);
      // Retry-spiral guard: the (threshold+1)th identical request in the window is refused before forwarding.
      const spiralHit = spiral?.observe(req.method, `/${rest.join("/")}`, body.toString("utf8"));
      if (spiralHit) {
        res.writeHead(429, { "content-type": "application/json" }).end(JSON.stringify({ error: "spiral_detected", ...spiralHit }));
        onReceipt?.({ ts: new Date().toISOString(), provider, blocked: true, reason: "spiral_detected", cost_usd: 0, ...spiralHit });
        return;
      }
      const headers = { ...req.headers };
      delete headers.host;
      delete headers["content-length"];
      try {
        const upstreamRes = await fetch(`${upstream}/${rest.join("/")}`, {
          method: req.method,
          headers,
          body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
        });
        const raw = Buffer.from(await upstreamRes.arrayBuffer());
        res.writeHead(upstreamRes.status, { "content-type": upstreamRes.headers.get("content-type") ?? "application/json" });
        res.end(raw);

        const text = raw.toString("utf8");
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {
          // SSE stream: usage lands in a late `data:` chunk when the caller
          // sets stream_options.include_usage (OpenAI) or in message_delta
          // (Anthropic). Take the last chunk that carries a usage object.
          for (const line of text.split("\n")) {
            if (!line.startsWith("data:") || line.includes("[DONE]")) continue;
            try {
              const chunk = JSON.parse(line.slice(5).trim());
              if (chunk?.usage) parsed = chunk;
            } catch { /* partial chunk */ }
          }
        }
        const usage = parsed && extractUsage(provider, parsed);
        if (usage) {
          const receipt = {
            ts: new Date().toISOString(),
            provider,
            path: `/${rest.join("/")}`,
            status: upstreamRes.status,
            model: parsed.model ?? "unknown",
            ...costForUsage(parsed.model ?? "unknown", usage),
          };
          cap?.record(receipt);
          velocity?.record(receipt.cost_usd ?? 0);
          if (receiptsPath) appendFileSync(receiptsPath, JSON.stringify(receipt) + "\n");
          onReceipt?.(receipt);
        }
      } catch (err) {
        res.writeHead(502).end(JSON.stringify({ error: `upstream fetch failed: ${err.message}` }));
      }
    });
  });
  return server;
}

export function startMeteringProxy(opts = {}, port = 0) {
  const server = createMeteringProxy(opts);
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}
