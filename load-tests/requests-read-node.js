const BASE_URL = process.env.BASE_URL || "http://localhost:8002/api";
const TOKEN = process.env.TOKEN;
const TOTAL_REQUESTS = Number(process.env.TOTAL_REQUESTS || 1000);
const CONCURRENCY = Number(process.env.CONCURRENCY || 50);

if (!TOKEN) {
  console.error("Missing TOKEN env variable");
  process.exit(1);
}

async function worker(workerId, count) {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < count; i++) {
    const started = Date.now();

    try {
      const res = await fetch(`${BASE_URL}/requests/`, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      });

      const ms = Date.now() - started;

      if (res.ok) {
        success++;
      } else {
        failed++;
        console.log(`Worker ${workerId}: status ${res.status} in ${ms}ms`);
      }
    } catch (error) {
      failed++;
      console.log(`Worker ${workerId}: ${error.message}`);
    }
  }

  return { success, failed };
}

async function main() {
  const perWorker = Math.ceil(TOTAL_REQUESTS / CONCURRENCY);
  const started = Date.now();

  console.log(`Running ${TOTAL_REQUESTS} requests with concurrency ${CONCURRENCY}`);
  console.log(`Target: ${BASE_URL}/requests/`);

  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, index) => worker(index + 1, perWorker))
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