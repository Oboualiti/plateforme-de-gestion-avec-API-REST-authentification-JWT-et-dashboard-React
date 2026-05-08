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
    const accessTokens = getTokens();
    const refreshTokensRaw = (process.env.REFRESH_TOKENS || "")
      .split(",")
      .map((v) => v.trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, ""))
      .filter(Boolean);
    const tokenStates = accessTokens.map((access, i) => ({
      access,
      refresh: refreshTokensRaw[i] || "",
    }));
    const refreshUrl = `${baseUrl}/auth/refresh/`;
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

    async function refreshAccessToken(tokenState) {
      if (!tokenState.refresh) return false;
      try {
        const res = await fetch(refreshUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh: tokenState.refresh }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (!data.access) return false;
        tokenState.access = String(data.access).trim();
        if (data.refresh) tokenState.refresh = String(data.refresh).trim();
        return true;
      } catch {
        return false;
      }
    }

    async function fetchWithAutoRefresh(tokenState, endpoint, options) {
      let res = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          ...getAuthHeaders(tokenState.access),
        },
      });
      if (res.status !== 401) return res;
      const refreshed = await refreshAccessToken(tokenState);
      if (!refreshed) return res;
      return fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          ...getAuthHeaders(tokenState.access),
        },
      });
    }

    async function runRead(workerId, tokenState) {
      const started = Date.now();
      try {
        const res = await fetchWithAutoRefresh(tokenState, "/requests/", {
          method: "GET",
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

    async function runCreate(workerId, tokenState, index) {
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

        const res = await fetchWithAutoRefresh(tokenState, "/requests/", {
          method: "POST",
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

        const tokenState = randomChoice(tokenStates);
        const op = Math.random() < 0.7 ? "read" : "create";
        if (op === "read") {
          await runRead(workerId, tokenState);
        } else {
          await runCreate(workerId, tokenState, index);
        }

        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }
    }

    console.log(`Running mixed load test: total=${totalRequests}, concurrency=${concurrency}`);
    if (refreshTokensRaw.length > 0) {
      console.log(`Auto-refresh enabled for ${refreshTokensRaw.length} token(s).`);
    } else {
      console.log("Auto-refresh disabled (set REFRESH_TOKENS to enable).");
    }
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
