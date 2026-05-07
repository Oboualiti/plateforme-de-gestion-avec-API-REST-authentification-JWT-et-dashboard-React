const {
  getBaseUrl,
  getTokens,
  getInvalidTargetTeamId,
  getAuthHeaders,
} = require("./config");
const { createMetrics, recordMetric, finalizeReport } = require("./reporting");

async function main() {
  try {
    const baseUrl = getBaseUrl();
    const tokens = getTokens();
    if (tokens.length > 1) {
      console.log("Using first token from TOKENS for invalid target test.");
    }
    const token = tokens[0];
    const invalidTarget = getInvalidTargetTeamId();
    const metrics = createMetrics();

    const formData = new FormData();
    formData.append("title", `[LOAD_TEST_INVALID] Cross company test ${Date.now()}`);
    formData.append("description", "This should be rejected by permissions.");
    formData.append("type", "INFO");
    formData.append("priority", "MEDIUM");
    formData.append("target_team", String(invalidTarget));
    formData.append("target_unit", String(invalidTarget));

    const started = Date.now();
    const res = await fetch(`${baseUrl}/requests/`, {
      method: "POST",
      headers: getAuthHeaders(token),
      body: formData,
    });
    const duration = Date.now() - started;

    const body = await res.text();
    const ok = res.status === 400 || res.status === 403;
    recordMetric(metrics, {
      method: "POST",
      endpoint: "/requests/",
      statusCode: res.status,
      durationMs: duration,
      success: ok,
      responseSnippet: body.slice(0, 1000),
      payload: {
        title: "[LOAD_TEST_INVALID] Cross company test timestamp",
        description: "This should be rejected by permissions.",
        type: "INFO",
        priority: "MEDIUM",
        target_team: String(invalidTarget),
        target_unit: String(invalidTarget),
      },
    });

    const reports = finalizeReport(metrics, "requests-invalid-cross-company");
    console.log(`Status: ${res.status}`);
    console.log(`Response: ${body.slice(0, 1000)}`);

    if (res.status === 400 || res.status === 403) {
      console.log("PASS: invalid target was blocked.");
    } else if (res.status === 200 || res.status === 201) {
      console.log("FAIL: invalid target was accepted. Permission bug.");
    } else {
      console.log("CHECK: unexpected response.");
    }
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
