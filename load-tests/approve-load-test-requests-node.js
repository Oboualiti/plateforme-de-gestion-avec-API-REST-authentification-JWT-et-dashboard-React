const { getBaseUrl, getTokens, getAuthHeaders } = require("./config");

const PREFIXES = ["[LOAD_TEST]", "[LOAD_TEST_INVALID]"];

function isLoadTestTitle(title) {
  return typeof title === "string" && PREFIXES.some((p) => title.startsWith(p));
}

function parseListResponse(data) {
  if (Array.isArray(data)) return { items: data, next: null };
  if (data && Array.isArray(data.results)) return { items: data.results, next: data.next || null };
  return { items: [], next: null };
}

async function fetchPage(baseUrl, token, page) {
  const res = await fetch(`${baseUrl}/requests/?page=${page}&page_size=100&scope=pending`, {
    headers: getAuthHeaders(token),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`List failed: ${res.status} ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  return parseListResponse(data);
}

async function approveOne(baseUrl, token, id) {
  const res = await fetch(`${baseUrl}/requests/${id}/status/`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "ACCEPTED", note: "" }),
  });
  return res;
}

async function main() {
  try {
    const baseUrl = getBaseUrl();
    const token = getTokens()[0];
    const candidates = [];

    let page = 1;
    let hasNext = true;
    while (hasNext && page <= 100) {
      const { items, next } = await fetchPage(baseUrl, token, page);
      if (!items.length) break;

      for (const item of items) {
        if (isLoadTestTitle(item.title)) candidates.push(item);
      }

      if (next) page += 1;
      else if (items.length === 100) page += 1;
      else hasNext = false;
    }

    if (!candidates.length) {
      console.log("No pending load-test requests found.");
      return;
    }

    let ok = 0;
    let fail = 0;
    for (const req of candidates) {
      const res = await approveOne(baseUrl, token, req.id);
      const ref = req.reference_code || req.request_number || req.id;
      if (res.ok) {
        ok += 1;
        console.log(`Approved: ${ref}`);
      } else {
        fail += 1;
        const body = await res.text();
        console.log(`Failed: ${ref} | ${res.status} | ${body.slice(0, 300)}`);
      }
    }

    console.log(`Done. Approved=${ok}, Failed=${fail}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
