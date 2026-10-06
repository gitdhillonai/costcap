// Alert rules for the hosted dashboard (story #14). Pure logic: given an
// agent's state, returns the alerts that should fire now. The caller sends
// them (Brevo email, Slack) and writes the audit log. Dedupe: an alert
// with the same key does not fire again until it clears and re-arms.

export const ALERT_KINDS = ["cap_approaching", "cap_hit", "loop_detected", "agent_silent"];

// state: { agentId, caps:{run,day,month}, spend:{run,day,month},
//          blockedReasons:[...recent blocked receipts' reason/error],
//          lastSeenMs, nowMs }
export function evaluateAlerts(state, { approachFraction = 0.8, silentAfterMs = 6 * 3600_000 } = {}) {
  const out = [];
  for (const scope of ["run", "day", "month"]) {
    const cap = state.caps?.[scope];
    if (cap == null) continue;
    const spent = state.spend?.[scope] ?? 0;
    if (spent >= cap) out.push({ kind: "cap_hit", scope, key: `cap_hit:${state.agentId}:${scope}`, cap, spent });
    else if (spent >= cap * approachFraction) out.push({ kind: "cap_approaching", scope, key: `cap_approaching:${state.agentId}:${scope}`, cap, spent });
  }
  if ((state.blockedReasons ?? []).some((r) => r === "spiral_detected" || r === "cost_velocity")) {
    out.push({ kind: "loop_detected", key: `loop_detected:${state.agentId}` });
  }
  if (state.lastSeenMs != null && state.nowMs - state.lastSeenMs > silentAfterMs) {
    out.push({ kind: "agent_silent", key: `agent_silent:${state.agentId}`, silentMs: state.nowMs - state.lastSeenMs });
  }
  return out;
}

// active: Set of keys currently firing (persisted by the caller).
// Returns { fire: alerts to send now, active: next Set }.
export function dedupeAlerts(alerts, active = new Set()) {
  const next = new Set(alerts.map((a) => a.key));
  return { fire: alerts.filter((a) => !active.has(a.key)), active: next };
}

// An audit-log entry is append-only and carries who, what, when.
export function auditEntry({ orgId, actor, action, target, detail = {}, now = new Date() }) {
  if (!orgId || !actor || !action) throw new Error("audit entry needs orgId, actor and action");
  return { ts: now.toISOString(), org_id: orgId, actor, action, target: target ?? null, detail };
}
