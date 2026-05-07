const fs = require("fs");
const path = require("path");

const REPORTS_DIR = path.join(__dirname, "reports");

function createRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function createMetrics() {
  return {
    runId: createRunId(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    requests: [],
    summary: null,
    reports: null,
  };
}

function recordMetric(metrics, data) {
  metrics.requests.push({
    method: data.method || "",
    endpoint: data.endpoint || "",
    statusCode: data.statusCode ?? "FETCH_ERR",
    durationMs: Number.isFinite(data.durationMs) ? data.durationMs : 0,
    success: Boolean(data.success),
    error: data.error || "",
    responseSnippet: (data.responseSnippet || "").slice(0, 1000),
    createdReference: data.createdReference || "",
    payload: data.payload || null,
    timestamp: data.timestamp || new Date().toISOString(),
  });
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function buildSummary(metrics, runName) {
  const finishedAt = new Date().toISOString();
  const durations = metrics.requests.map((r) => r.durationMs).sort((a, b) => a - b);
  const total = metrics.requests.length;
  const success = metrics.requests.filter((r) => r.success).length;
  const failed = total - success;
  const startedMs = new Date(metrics.startedAt).getTime();
  const finishedMs = new Date(finishedAt).getTime();
  const durationSeconds = Math.max(0.001, (finishedMs - startedMs) / 1000);
  const sumMs = durations.reduce((s, n) => s + n, 0);
  const average = total ? sumMs / total : 0;
  const fastest = durations.length ? durations[0] : 0;
  const slowest = durations.length ? durations[durations.length - 1] : 0;
  const statusCodeCounts = {};
  const endpointCounts = {};
  const methodCounts = {};

  for (const r of metrics.requests) {
    const s = String(r.statusCode);
    statusCodeCounts[s] = (statusCodeCounts[s] || 0) + 1;
    endpointCounts[r.endpoint] = (endpointCounts[r.endpoint] || 0) + 1;
    methodCounts[r.method] = (methodCounts[r.method] || 0) + 1;
  }

  return {
    runName,
    runId: metrics.runId,
    startedAt: metrics.startedAt,
    finishedAt,
    durationSeconds,
    totalRequests: total,
    successCount: success,
    failedCount: failed,
    successRate: total ? (success / total) * 100 : 0,
    approximateRps: total / durationSeconds,
    fastestResponseMs: fastest,
    slowestResponseMs: slowest,
    averageResponseMs: average,
    p50: percentile(durations, 50),
    p90: percentile(durations, 90),
    p95: percentile(durations, 95),
    p99: percentile(durations, 99),
    statusCodeCounts,
    endpointCounts,
    methodCounts,
  };
}

function ensureReportsDir() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function writeJsonReport(metrics, runName) {
  ensureReportsDir();
  const filename = `${runName}-${metrics.runId}.json`;
  const fullPath = path.join(REPORTS_DIR, filename);
  const payload = {
    summary: metrics.summary,
    requests: metrics.requests,
  };
  fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), "utf8");
  return fullPath;
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toPretty(ms) {
  return Number(ms || 0).toFixed(2);
}

function writeHtmlReport(metrics, runName) {
  ensureReportsDir();
  const filename = `${runName}-${metrics.runId}.html`;
  const fullPath = path.join(REPORTS_DIR, filename);
  const latestByRun = path.join(REPORTS_DIR, `${runName}-latest.html`);
  const latestGlobal = path.join(REPORTS_DIR, "latest.html");

  const failed = metrics.requests.filter((r) => !r.success);
  const groupedProblems = {};
  for (const r of failed) {
    const key = `${r.statusCode} | ${r.error || "no error"} | ${(r.responseSnippet || "").slice(0, 120)}`;
    groupedProblems[key] = (groupedProblems[key] || 0) + 1;
  }
  const problemRows = Object.entries(groupedProblems)
    .map(([k, c]) => {
      const [status, error, snippet] = k.split(" | ");
      return `<tr><td>${esc(status)}</td><td>${esc(error)}</td><td>${esc(snippet)}</td><td>${c}</td></tr>`;
    })
    .join("");

  const slowestRows = [...metrics.requests]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 20)
    .map(
      (r) =>
        `<tr><td>${esc(r.method)}</td><td>${esc(r.endpoint)}</td><td>${esc(
          r.statusCode
        )}</td><td>${toPretty(r.durationMs)}</td><td>${r.success ? "yes" : "no"}</td><td>${esc(
          (r.responseSnippet || "").slice(0, 180)
        )}</td></tr>`
    )
    .join("");

  const createdRows = metrics.requests
    .filter((r) => r.createdReference)
    .map((r) => `<tr><td>${esc(r.createdReference)}</td><td>${esc(r.timestamp)}</td></tr>`)
    .join("");

  const statusRows = Object.entries(metrics.summary.statusCodeCounts)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`)
    .join("");

  const requestData = esc(JSON.stringify(metrics.requests));

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(metrics.summary.runName)} Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 18px; background: #f7f8fa; color: #1f2937; }
    h1,h2 { margin: 0 0 10px 0; }
    .muted { color: #6b7280; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px,1fr)); gap: 10px; margin: 12px 0 16px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
    .k { font-size: 12px; color: #6b7280; }
    .v { font-size: 20px; font-weight: 700; margin-top: 4px; }
    .section { margin-top: 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th,td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    .filters { display: flex; gap: 8px; margin: 8px 0; flex-wrap: wrap; }
    input,select { padding: 6px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
  </style>
</head>
<body>
  <h1>${esc(metrics.summary.runName.replaceAll("-", " ").toUpperCase())} Load Test</h1>
  <div class="muted">Run ID: ${esc(metrics.summary.runId)} | Started: ${esc(
    metrics.summary.startedAt
  )} | Finished: ${esc(metrics.summary.finishedAt)} | Duration: ${metrics.summary.durationSeconds.toFixed(2)}s</div>

  <div class="grid">
    <div class="card"><div class="k">Total</div><div class="v">${metrics.summary.totalRequests}</div></div>
    <div class="card"><div class="k">Success</div><div class="v">${metrics.summary.successCount}</div></div>
    <div class="card"><div class="k">Failed</div><div class="v">${metrics.summary.failedCount}</div></div>
    <div class="card"><div class="k">Success rate</div><div class="v">${metrics.summary.successRate.toFixed(2)}%</div></div>
    <div class="card"><div class="k">Approx RPS</div><div class="v">${metrics.summary.approximateRps.toFixed(2)}</div></div>
  </div>

  <div class="grid">
    <div class="card"><div class="k">Avg</div><div class="v">${toPretty(metrics.summary.averageResponseMs)}ms</div></div>
    <div class="card"><div class="k">p50</div><div class="v">${toPretty(metrics.summary.p50)}ms</div></div>
    <div class="card"><div class="k">p90</div><div class="v">${toPretty(metrics.summary.p90)}ms</div></div>
    <div class="card"><div class="k">p95</div><div class="v">${toPretty(metrics.summary.p95)}ms</div></div>
    <div class="card"><div class="k">p99</div><div class="v">${toPretty(metrics.summary.p99)}ms</div></div>
    <div class="card"><div class="k">Slowest</div><div class="v">${toPretty(metrics.summary.slowestResponseMs)}ms</div></div>
  </div>

  <div class="section">
    <h2>Status Codes</h2>
    <table><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>${statusRows}</tbody></table>
  </div>

  <div class="section">
    <h2>Problems / Errors</h2>
    <table><thead><tr><th>Status</th><th>Error</th><th>Response Snippet</th><th>Count</th></tr></thead><tbody>${problemRows}</tbody></table>
  </div>

  <div class="section">
    <h2>Slowest Requests (Top 20)</h2>
    <table><thead><tr><th>Method</th><th>Endpoint</th><th>Status</th><th>Duration ms</th><th>Success</th><th>Snippet</th></tr></thead><tbody>${slowestRows}</tbody></table>
  </div>

  <div class="section">
    <h2>Created Requests</h2>
    <table><thead><tr><th>Reference</th><th>Timestamp</th></tr></thead><tbody>${createdRows}</tbody></table>
  </div>

  <div class="section">
    <h2>Full Request Log</h2>
    <div class="filters">
      <select id="statusFilter"><option value="">All status</option></select>
      <select id="successFilter">
        <option value="">All</option>
        <option value="true">Success</option>
        <option value="false">Failed</option>
      </select>
      <input id="searchInput" placeholder="Search endpoint/error/snippet" />
    </div>
    <table>
      <thead><tr><th>Time</th><th>Method</th><th>Endpoint</th><th>Status</th><th>Duration</th><th>Success</th><th>Error</th><th>Snippet</th><th>Created Ref</th></tr></thead>
      <tbody id="reqRows"></tbody>
    </table>
  </div>

  <script>
    const data = JSON.parse("${requestData}");
    const statusFilter = document.getElementById("statusFilter");
    const successFilter = document.getElementById("successFilter");
    const searchInput = document.getElementById("searchInput");
    const reqRows = document.getElementById("reqRows");

    const statuses = [...new Set(data.map(d => String(d.statusCode)))].sort((a,b) => a.localeCompare(b));
    statuses.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      statusFilter.appendChild(opt);
    });

    function escHtml(v) {
      return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
    }

    function render() {
      const s = statusFilter.value;
      const ok = successFilter.value;
      const q = searchInput.value.trim().toLowerCase();
      const rows = data.filter(r => {
        if (s && String(r.statusCode) !== s) return false;
        if (ok && String(r.success) !== ok) return false;
        if (q) {
          const blob = (r.endpoint + " " + (r.error || "") + " " + (r.responseSnippet || "") + " " + (r.createdReference || "")).toLowerCase();
          if (!blob.includes(q)) return false;
        }
        return true;
      });
      reqRows.innerHTML = rows.map(r => "<tr>" +
        "<td>" + escHtml(r.timestamp) + "</td>" +
        "<td>" + escHtml(r.method) + "</td>" +
        "<td>" + escHtml(r.endpoint) + "</td>" +
        "<td>" + escHtml(r.statusCode) + "</td>" +
        "<td>" + Number(r.durationMs || 0).toFixed(2) + "</td>" +
        "<td>" + (r.success ? "yes" : "no") + "</td>" +
        "<td>" + escHtml(r.error || "") + "</td>" +
        "<td>" + escHtml((r.responseSnippet || "").slice(0, 180)) + "</td>" +
        "<td>" + escHtml(r.createdReference || "") + "</td>" +
      "</tr>").join("");
    }

    statusFilter.addEventListener("change", render);
    successFilter.addEventListener("change", render);
    searchInput.addEventListener("input", render);
    render();
  </script>
</body>
</html>`;

  fs.writeFileSync(fullPath, html, "utf8");
  fs.copyFileSync(fullPath, latestByRun);
  fs.copyFileSync(fullPath, latestGlobal);
  return fullPath;
}

function finalizeReport(metrics, runName) {
  metrics.summary = buildSummary(metrics, runName);
  metrics.finishedAt = metrics.summary.finishedAt;
  const jsonPath = writeJsonReport(metrics, runName);
  const htmlPath = writeHtmlReport(metrics, runName);
  metrics.reports = { jsonPath, htmlPath };
  return metrics.reports;
}

module.exports = {
  createRunId,
  createMetrics,
  recordMetric,
  writeJsonReport,
  writeHtmlReport,
  finalizeReport,
};
