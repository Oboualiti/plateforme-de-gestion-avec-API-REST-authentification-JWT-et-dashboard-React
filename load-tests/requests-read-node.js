const {
  getBaseUrl,
  getTokens,
  getTotalRequests,
  getConcurrency,
  getDelayMs,
  randomChoice,
  sleep,
  getAuthHeaders,
} = require("./config");
const { createMetrics, recordMetric, finalizeReport } = require("./reporting");

async function main() {
  try {
    const baseUrl = getBaseUrl();
    const tokens = getTokens();
    const totalRequests = getTotalRequests();
    const concurrency = getConcurrency();
    const delayMs = getDelayMs();
    const metrics = createMetrics();

    let nextIndex = 0;

    async function worker(workerId) {
      while (true) {
        const i = nextIndex++;
        if (i >= totalRequests) break;

        const token = randomChoice(tokens);
        const started = Date.now();

        try {
          const res = await fetch(`${baseUrl}/requests/`, {
            method: "GET",
            headers: getAuthHeaders(token),
          });
          const duration = Date.now() - started;
          const ok = res.status >= 200 && res.status < 300;
          let responseSnippet = "";
          if (!ok) {
            const body = await res.text();
            responseSnippet = body.slice(0, 1000);
            console.log(`Worker ${workerId}: status ${res.status} in ${duration}ms | ${body.slice(0, 500)}`);
          }
          recordMetric(metrics, {
            method: "GET",
            endpoint: "/requests/",
            statusCode: res.status,
            durationMs: duration,
            success: ok,
            responseSnippet,
          });

        } catch (error) {
          const duration = Date.now() - started;
          recordMetric(metrics, {
            method: "GET",
            endpoint: "/requests/",
            statusCode: "FETCH_ERR",
            durationMs: duration,
            success: false,
            error: error.message,
          });
          console.log(`Worker ${workerId}: fetch failed - ${error.message}`);
        }

        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }
    }

    console.log(`Running read load test: total=${totalRequests}, concurrency=${concurrency}`);
    await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));
    const reports = finalizeReport(metrics, "requests-read");
    const s = metrics.summary;
    console.log("");
    console.log("Done");
    console.log(`Success: ${s.successCount}`);
    console.log(`Failed: ${s.failedCount}`);
    console.log(`Duration: ${s.durationSeconds.toFixed(2)}s`);
    console.log(`Approx RPS: ${s.approximateRps.toFixed(2)}`);
    console.log("");
    console.log("Reports:");
    console.log(`HTML: ${reports.htmlPath}`);
    console.log(`JSON: ${reports.jsonPath}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
