import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8002/api";

const TOKENS = (__ENV.TOKENS || __ENV.TOKEN || "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

const TARGET_TEAM_IDS = (__ENV.TARGET_TEAM_IDS || __ENV.TARGET_TEAM_ID || "15")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const TYPES = ["INFO", "SCRIPT", "TOOL", "APP_PROJECT"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

export const options = {
  vus: Number(__ENV.VUS || 10),
  iterations: Number(__ENV.ITERATIONS || 100),
  thresholds: {
    http_req_failed: ["rate<0.10"],
    http_req_duration: ["p(95)<2500"],
  },
};

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function () {
  const token = randomChoice(TOKENS);
  const targetTeamId = randomChoice(TARGET_TEAM_IDS);

  const payload = {
    title: `[LOAD_TEST] k6 request ${Date.now()}-${Math.random()}`,
    description: "Created by k6 load test.",
    type: randomChoice(TYPES),
    priority: randomChoice(PRIORITIES),
    target_team: targetTeamId,
    target_unit: targetTeamId,
  };

  const res = http.post(`${BASE_URL}/requests/`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  check(res, {
    "created": (r) => r.status === 200 || r.status === 201,
  });
}