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

    let readSuccess = 0;
    let readFailed = 0;
    let createSuccess = 0;
    let createFailed = 0;
    let nextIndex = 0;

    async function runRead(workerId, token) {
      const started = Date.now();
      try {
        const res = await fetch(`${baseUrl}/requests/`, {
          method: "GET",
          headers: getAuthHeaders(token),
        });
        const duration = Date.now() - started;
        const ok = res.status >= 200 && res.status < 300;
        let responseSnippet = "";
        if (ok) {
          readSuccess += 1;
        } else {
          readFailed += 1;
          const body = await res.text();
          responseSnippet = body.slice(0, 1000);
          console.log(
            `Worker ${workerId} READ: ${res.status} in ${duration}ms | ${body.slice(0, 500)}`
          );
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
        readFailed += 1;
        console.log(`Worker ${workerId} READ: fetch failed - ${error.message}`);
      }
    }

    async function runCreate(workerId, token, index) {
      const targetTeamId = randomChoice(targetTeamIds);
      const payload = {
        title: `[LOAD_TEST] Request ${Date.now()}-${workerId}-${index}`,
        description: "Created by mixed load test.",
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
        let responseSnippet = "";
        let createdReference = "";
        if (ok) {
          createSuccess += 1;
          const body = await res.text();
          try {
            const data = JSON.parse(body);
            createdReference = data.reference_code || data.request_number || String(data.id || "");
          } catch {}
        } else {
          createFailed += 1;
          const body = await res.text();
          responseSnippet = body.slice(0, 1000);
          console.log(`Worker ${workerId} CREATE: ${res.status} in ${duration}ms`);
          console.log(`Payload: ${JSON.stringify(payload)}`);
          console.log(`Response: ${body.slice(0, 500)}`);
        }
        recordMetric(metrics, {
          method: "POST",
          endpoint: "/requests/",
          statusCode: res.status,
          durationMs: duration,
          success: ok,
          responseSnippet,
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
        createFailed += 1;
        console.log(`Worker ${workerId} CREATE: fetch failed - ${error.message}`);
      }
    }

    async function worker(workerId) {
      while (true) {
        const index = nextIndex++;
        if (index >= totalRequests) break;

        const token = randomChoice(tokens);
        const op = Math.random() < 0.7 ? "read" : "create";
        if (op === "read") {
          await runRead(workerId, token);
        } else {
          await runCreate(workerId, token, index);
        }

        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }
    }

    console.log(`Running mixed load test: total=${totalRequests}, concurrency=${concurrency}`);
    await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));

    console.log("");
    console.log(`readSuccess: ${readSuccess}`);
    console.log(`readFailed: ${readFailed}`);
    console.log(`createSuccess: ${createSuccess}`);
    console.log(`createFailed: ${createFailed}`);
    const reports = finalizeReport(metrics, "requests-mixed");
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
