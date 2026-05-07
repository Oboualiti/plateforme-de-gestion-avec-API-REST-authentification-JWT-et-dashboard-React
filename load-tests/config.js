const DEFAULT_BASE_URL = "http://localhost:8002/api";

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function getBaseUrl() {
  return (process.env.BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function getTokens() {
  function normalizeToken(raw) {
    const cleaned = raw.trim().replace(/^["']|["']$/g, "");
    return cleaned.replace(/^Bearer\s+/i, "").trim();
  }

  const rawTokens = process.env.TOKENS;
  if (rawTokens && rawTokens.trim()) {
    const tokens = rawTokens
      .split(",")
      .map((t) => normalizeToken(t))
      .filter(Boolean);
    if (tokens.length) return tokens;
  }

  const token = normalizeToken(process.env.TOKEN || "");
  if (!token) {
    throw new Error("Missing auth token. Set TOKEN or TOKENS.");
  }
  return [token];
}

function getTargetTeamIds() {
  const raw = process.env.TARGET_TEAM_IDS;
  if (raw && raw.trim()) {
    const ids = raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (ids.length) return ids;
  }

  const single = (process.env.TARGET_TEAM_ID || "").trim();
  if (!single) {
    throw new Error("Missing target team. Set TARGET_TEAM_ID or TARGET_TEAM_IDS.");
  }
  return [single];
}

function getInvalidTargetTeamId() {
  const id = (process.env.INVALID_TARGET_TEAM_ID || "").trim();
  if (!id) {
    throw new Error("Missing INVALID_TARGET_TEAM_ID.");
  }
  return id;
}

function getTotalRequests() {
  return parsePositiveInt(process.env.TOTAL_REQUESTS, 100);
}

function getConcurrency() {
  return parsePositiveInt(process.env.CONCURRENCY, 10);
}

function getDelayMs() {
  const n = Number(process.env.DELAY_MS || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAuthHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function createMetrics() {
  return {
    startedAt: Date.now(),
    total: 0,
    success: 0,
    failed: 0,
    durations: [],
    statusCounts: {},
  };
}

function recordMetric(metrics, status, durationMs, success) {
  metrics.total += 1;
  metrics.durations.push(durationMs);
  const key = String(status);
  metrics.statusCounts[key] = (metrics.statusCounts[key] || 0) + 1;
  if (success) {
    metrics.success += 1;
  } else {
    metrics.failed += 1;
  }
}

function printMetrics(metrics, label) {
  const elapsedMs = Date.now() - metrics.startedAt;
  const elapsedSeconds = elapsedMs / 1000;
  const sorted = [...metrics.durations].sort((a, b) => a - b);
  const fastest = sorted.length ? sorted[0] : 0;
  const slowest = sorted.length ? sorted[sorted.length - 1] : 0;
  const avg = sorted.length
    ? sorted.reduce((sum, ms) => sum + ms, 0) / sorted.length
    : 0;
  const p95Index = sorted.length ? Math.ceil(sorted.length * 0.95) - 1 : 0;
  const p95 = sorted.length ? sorted[Math.max(0, p95Index)] : 0;
  const rps = elapsedSeconds > 0 ? metrics.total / elapsedSeconds : 0;

  console.log("");
  console.log(`=== ${label} ===`);
  console.log(`Total: ${metrics.total}`);
  console.log(`Success: ${metrics.success}`);
  console.log(`Failed: ${metrics.failed}`);
  console.log(`Duration: ${elapsedSeconds.toFixed(2)}s`);
  console.log(`Approx RPS: ${rps.toFixed(2)}`);
  console.log(`Fastest: ${fastest.toFixed(2)}ms`);
  console.log(`Slowest: ${slowest.toFixed(2)}ms`);
  console.log(`Average: ${avg.toFixed(2)}ms`);
  console.log(`P95: ${p95.toFixed(2)}ms`);
  console.log(`Status counts: ${JSON.stringify(metrics.statusCounts)}`);
}

module.exports = {
  getBaseUrl,
  getTokens,
  getTargetTeamIds,
  getInvalidTargetTeamId,
  getTotalRequests,
  getConcurrency,
  getDelayMs,
  randomChoice,
  sleep,
  getAuthHeaders,
  createMetrics,
  recordMetric,
  printMetrics,
};
