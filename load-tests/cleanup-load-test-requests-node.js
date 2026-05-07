const { getBaseUrl, getTokens, getAuthHeaders } = require("./config");

const PREFIXES = ["[LOAD_TEST]", "[LOAD_TEST_INVALID]"];

function getRef(item) {
  return item.reference_code || item.request_number || item.id;
}

function isLoadTestTitle(title) {
  if (typeof title !== "string") return false;
  return PREFIXES.some((prefix) => title.startsWith(prefix));
}

function parseListResponse(data) {
  if (Array.isArray(data)) return { items: data, next: null };
  if (data && Array.isArray(data.results)) return { items: data.results, next: data.next || null };
  return { items: [], next: null };
}

async function fetchPage(baseUrl, token, page) {
  const url = `${baseUrl}/requests/?page=${page}&page_size=100`;
  const res = await fetch(url, { headers: getAuthHeaders(token) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch page ${page}: ${res.status} ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const parsed = parseListResponse(data);
  return parsed;
}

async function main() {
  try {
    const baseUrl = getBaseUrl();
    const tokens = getTokens();
    if (tokens.length > 1) {
      console.log("Using first token from TOKENS for cleanup.");
    }
    const token = tokens[0];

    const targets = [];
    let page = 1;
    let hasNext = true;

    while (hasNext && page <= 100) {
      const { items, next } = await fetchPage(baseUrl, token, page);
      if (!items.length) break;

      for (const item of items) {
        if (isLoadTestTitle(item.title)) {
          targets.push(item);
        }
      }

      if (next) {
        page += 1;
        continue;
      }

      if (!next && items.length === 100) {
        page += 1;
      } else {
        hasNext = false;
      }
    }

    if (!targets.length) {
      console.log("No load test requests found.");
      return;
    }

    console.log(`Found ${targets.length} load test requests.`);

    for (const item of targets) {
      const ref = getRef(item);
      const url = `${baseUrl}/requests/${item.id}/`;
      try {
        const res = await fetch(url, {
          method: "DELETE",
          headers: getAuthHeaders(token),
        });

        if (res.ok || res.status === 204) {
          console.log(`Deleted: ${ref}`);
          continue;
        }

        if (res.status === 404 || res.status === 405) {
          console.log("Could not delete automatically. Manual cleanup needed:");
          console.log(`id: ${item.id}, ref: ${ref}, title: ${item.title}`);
          continue;
        }

        const body = await res.text();
        console.log("Could not delete automatically. Manual cleanup needed:");
        console.log(`id: ${item.id}, ref: ${ref}, title: ${item.title}`);
        console.log(`delete status: ${res.status}, response: ${body.slice(0, 500)}`);
      } catch (error) {
        console.log("Could not delete automatically. Manual cleanup needed:");
        console.log(`id: ${item.id}, ref: ${ref}, title: ${item.title}`);
        console.log(`error: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
