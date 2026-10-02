// Cost-velocity circuit breaker. Tracks spend per bucket (default 10s) and
// trips when the current rate exceeds `multiple` x the baseline rate, once
// the baseline is established. Also enforces an optional step budget
// (max upstream calls per run). Pure module, no I/O.

export function createVelocityBreaker({
  bucketMs = 10_000,
  baselineBuckets = 6,
  multiple = 3,
  minSpendUsd = 0.5,
  maxSteps,
  now = () => Date.now(),
} = {}) {
  const buckets = new Map(); // bucket index -> usd
  let steps = 0;
  let tripped = null;
  const idx = () => Math.floor(now() / bucketMs);

  return {
    // Call once per upstream call that reached the provider.
    record(costUsd) {
      steps += 1;
      const i = idx();
      buckets.set(i, (buckets.get(i) ?? 0) + costUsd);
      for (const k of buckets.keys()) if (k < i - baselineBuckets - 1) buckets.delete(k);
    },
    // Returns null if calls may proceed, else a descriptor. Latches once tripped.
    check() {
      if (tripped) return tripped;
      if (maxSteps != null && steps >= maxSteps) {
        return (tripped = { reason: "step_budget", steps, max_steps: maxSteps });
      }
      const i = idx();
      const current = buckets.get(i) ?? 0;
      let prior = 0;
      let seen = 0;
      for (let k = i - baselineBuckets; k < i; k++) {
        if (buckets.has(k)) { prior += buckets.get(k); seen += 1; }
      }
      if (seen < Math.min(3, baselineBuckets)) return null; // no baseline yet
      const baseline = prior / baselineBuckets;
      if (current >= minSpendUsd && current > multiple * Math.max(baseline, 1e-9)) {
        return (tripped = {
          reason: "cost_velocity",
          current_usd_per_bucket: Number(current.toFixed(6)),
          baseline_usd_per_bucket: Number(baseline.toFixed(6)),
          multiple,
          bucket_ms: bucketMs,
        });
      }
      return null;
    },
    resume() { tripped = null; steps = 0; buckets.clear(); },
  };
}
