const {
  getBaseUrl,
  getTokens,
  getTargetTeamIds,
  getTotalRequests,
  getConcurrency,
  getDelayMs,
  randomChoice,
  sleep,
  getAuthHeaders,
} = require("./config");
const { createMetrics, recordMetric, finalizeReport } = require("./reporting");

const TYPES = ["INFO", "SCRIPT", "TOOL", "APP_PROJECT"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

async function main() {
  try {
    const baseUrl = getBaseUrl();
    const tokens = getTokens();
    const targetTeamIds = getTargetTeamIds();
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
        const targetTeamId = randomChoice(targetTeamIds);
        const payload = {
          title: `[LOAD_TEST] Request ${Date.now()}-${workerId}-${i}`,
          description: "Created by load test.",
          type: randomChoice(TYPES),
          priority: randomChoice(PRIORITIES),
          target_team: String(targetTeamId),
          target_unit: String(targetTeamId),
        };
        const started = Date.now();

        try {
          const formData = new FormData();
          formData.append("title", payload.title);
          formData.append("description", payload.description);
          formData.append("type", payload.type);
          formData.append("priority", payload.priority);
          formData.append("target_team", payload.target_team);
          formData.append("target_unit", payload.target_unit);

          const res = await fetch(`${baseUrl}/requests/`, {
            method: "POST",
            headers: getAuthHeaders(token),
            body: formData,
          });

          const duration = Date.now() - started;
          const ok = res.status === 200 || res.status === 201;
          const bodyText = await res.text();
          let createdReference = "";
          if (ok) {
            try {
              const data = JSON.parse(bodyText);
              createdReference = data.reference_code || data.request_number || String(data.id || "");
              console.log(`Worker ${workerId}: created ${createdReference} in ${duration}ms`);
            } catch {
              console.log(`Worker ${workerId}: created in ${duration}ms`);
            }
          } else {
            console.log(`Worker ${workerId}: status ${res.status} in ${duration}ms`);
            console.log(`Payload: ${JSON.stringify(payload)}`);
            console.log(`Response: ${bodyText.slice(0, 1000)}`);
          }

          recordMetric(metrics, {
            method: "POST",
            endpoint: "/requests/",
            statusCode: res.status,
            durationMs: duration,
            success: ok,
            responseSnippet: ok ? "" : bodyText.slice(0, 1000),
            createdReference,
            payload,
          });
        } catch (error) {
          const duration = Date.now() - started;
          recordMetric(metrics, {
            method: "POST",
            endpoint: "/requests/",
            statusCode: "FETCH_ERR",
            durationMs: duration,
            success: false,
            error: error.message,
            payload,
          });
          console.log(`Worker ${workerId}: fetch failed - ${error.message}`);
        }

        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }
    }

    console.log(`Running create load test: total=${totalRequests}, concurrency=${concurrency}`);
    await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));
    const reports = finalizeReport(metrics, "requests-create");
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
