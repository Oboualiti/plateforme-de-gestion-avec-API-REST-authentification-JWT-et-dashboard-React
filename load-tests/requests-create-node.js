const BASE_URL = process.env.BASE_URL || "http://localhost:8002/api";
const TOKEN = process.env.TOKEN;

const TOTAL_REQUESTS = Number(process.env.TOTAL_REQUESTS || 20);
const CONCURRENCY = Number(process.env.CONCURRENCY || 2);
const DELAY_MS = Number(process.env.DELAY_MS || 0);

const TARGET_TEAM_ID = process.env.TARGET_TEAM_ID;

const REQUEST_TYPE = process.env.REQUEST_TYPE || "INFO";
const PRIORITY = process.env.PRIORITY || "MEDIUM";

if (!TOKEN) {
  console.error("Missing TOKEN env variable");
  process.exit(1);
}

if (!TARGET_TEAM_ID) {
  console.error("Missing TARGET_TEAM_ID");
  console.error("Example:");
  console.error('$env:TARGET_TEAM_ID="5"');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPayload(index) {
  return {
    title: `Load test request ${Date.now()}-${index}`,
    description: "Created by backend load test. Safe test data.",
    type: REQUEST_TYPE,
    priority: PRIORITY,
    target_team: Number(TARGET_TEAM_ID),
  };
}

async function worker(workerId, count) {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < count; i++) {
    const started = Date.now();
    const payload = createPayload(`${workerId}-${i}`);

    try {
      const formData = new FormData();
      formData.append("title", payload.title);
      formData.append("description", payload.description);
      formData.append("type", payload.type);
      formData.append("priority", payload.priority);
      formData.append("target_team", String(payload.target_team));
formData.append("target_unit", String(payload.target_team));

      const res = await fetch(`${BASE_URL}/requests/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
        },
        body: formData,
      });

      const ms = Date.now() - started;
      const bodyText = await res.text();

      if (res.ok) {
        success++;

        try {
          const data = JSON.parse(bodyText);
          console.log(
            `Worker ${workerId}: created ${data.reference_code || data.request_number || data.id} in ${ms}ms`
          );
        } catch {
          console.log(`Worker ${workerId}: created request in ${ms}ms`);
        }
      } else {
        failed++;
        console.log(`Worker ${workerId}: status ${res.status} in ${ms}ms`);
        console.log("Payload:", JSON.stringify(payload));
        console.log("Response:", bodyText.slice(0, 1000));
      }
    } catch (error) {
      failed++;
      console.log(`Worker ${workerId}: fetch failed - ${error.message}`);
    }

    if (DELAY_MS > 0) {
      await sleep(DELAY_MS);
    }
  }

  return { success, failed };
}

async function main() {
  const perWorker = Math.ceil(TOTAL_REQUESTS / CONCURRENCY);
  const started = Date.now();

  console.log(`Creating ${TOTAL_REQUESTS} requests with concurrency ${CONCURRENCY}`);
  console.log(`Target: ${BASE_URL}/requests/`);
  console.log(`Target team: ${TARGET_TEAM_ID}`);
  console.log(`Type: ${REQUEST_TYPE}`);
  console.log(`Priority: ${PRIORITY}`);
  console.log("");

  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, index) =>
      worker(index + 1, perWorker)
    )
  );

  const totalSuccess = results.reduce((sum, r) => sum + r.success, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const seconds = (Date.now() - started) / 1000;

  console.log("");
  console.log("Done");
  console.log(`Success: ${totalSuccess}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Duration: ${seconds.toFixed(2)}s`);
  console.log(`Approx RPS: ${(TOTAL_REQUESTS / seconds).toFixed(2)}`);
}

main();