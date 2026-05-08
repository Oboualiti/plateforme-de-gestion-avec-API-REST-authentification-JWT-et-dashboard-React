import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8002/api";

// Format:
// ROUTES="tokenA:15;tokenB:13;tokenC:8"
const ROUTES = (__ENV.ROUTES || "")
  .split(";")
  .map((item) => item.trim())
  .filter(Boolean)
  .map((item) => {
    const [token, targetTeamId] = item.split(":");
    return {
      token: token?.trim(),
      targetTeamId: targetTeamId?.trim(),
    };
  })
  .filter((route) => route.token && route.targetTeamId);

const REQUESTS_PER_USER = Number(__ENV.REQUESTS_PER_USER || 1000);
const VUS_PER_USER = Number(__ENV.VUS_PER_USER || 10);

const TYPES = ["INFO", "SCRIPT", "TOOL", "APP_PROJECT"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

if (!ROUTES.length) {
  throw new Error(
    'Missing ROUTES. Example: ROUTES="tokenA:15;tokenB:13;tokenC:8"'
  );
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const options = {
  scenarios: Object.fromEntries(
    ROUTES.map((route, index) => [
      `user_${index + 1}`,
      {
        executor: "shared-iterations",
        vus: VUS_PER_USER,
        iterations: REQUESTS_PER_USER,
        maxDuration: "2h",
        env: {
          ROUTE_INDEX: String(index),
        },
      },
    ])
  ),
  thresholds: {
    http_req_failed: ["rate<0.10"],
    http_req_duration: ["p(95)<3000"],
  },
};

export default function () {
  const route = ROUTES[Number(__ENV.ROUTE_INDEX || "0")];

  const targetTeamId = route.targetTeamId;

  const payload = {
    title: `[LOAD_TEST] k6 user ${__ENV.ROUTE_INDEX} request ${Date.now()}-${Math.random()}`,
    description: "Created by k6 per-user load test.",
    type: randomChoice(TYPES),
    priority: randomChoice(PRIORITIES),
    target_team: targetTeamId,
    target_unit: targetTeamId,
  };

  const res = http.post(`${BASE_URL}/requests/`, payload, {
    headers: {
      Authorization: `Bearer ${route.token}`,
    },
  });

  check(res, {
    "created": (r) => r.status === 200 || r.status === 201,
  });

  // tiny pause so local dev server is less likely to choke instantly
  sleep(Number(__ENV.SLEEP_SECONDS || 0));
}