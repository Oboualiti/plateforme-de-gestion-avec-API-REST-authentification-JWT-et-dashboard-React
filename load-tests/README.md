# Load Tests (Node 18+)

Warning:
- Do not run against production.
- Use test/staging/local DB.
- Create tests generate real records.
- Use cleanup script after create/mixed tests.
- Every run now writes JSON + HTML reports in `load-tests/reports/`.

## Environment variables

- `BASE_URL` (default: `http://localhost:8002/api`)
- `TOKEN` (single token)
- `TOKENS` (comma-separated tokens)
- `TARGET_TEAM_ID` (single valid team id)
- `TARGET_TEAM_IDS` (comma-separated valid team ids)
- `INVALID_TARGET_TEAM_ID` (for permission test)
- `TOTAL_REQUESTS` (default: `100`)
- `CONCURRENCY` (default: `10`)
- `DELAY_MS` (default: `0`)

## Run in PowerShell

Read test:
```powershell
$env:BASE_URL="http://localhost:8002/api"
$env:TOKEN="..."
$env:TOTAL_REQUESTS="1000"
$env:CONCURRENCY="50"
node load-tests/requests-read-node.js
```

Create test:
```powershell
$env:BASE_URL="http://localhost:8002/api"
$env:TOKEN="..."
$env:TARGET_TEAM_IDS="15"
$env:TOTAL_REQUESTS="100"
$env:CONCURRENCY="10"
node load-tests/requests-create-node.js
```

Mixed test:
```powershell
$env:BASE_URL="http://localhost:8002/api"
$env:TOKENS="token1,token2"
$env:TARGET_TEAM_IDS="15,16,17"
$env:TOTAL_REQUESTS="1000"
$env:CONCURRENCY="50"
node load-tests/requests-mixed-node.js
```

Invalid target test:
```powershell
$env:TOKEN="..."
$env:INVALID_TARGET_TEAM_ID="999999"
node load-tests/requests-invalid-cross-company-node.js
```

Cleanup:
```powershell
$env:TOKEN="..."
node load-tests/cleanup-load-test-requests-node.js
```

## Reports

Output folder:
- `load-tests/reports/`

Each run writes:
- `<run-name>-YYYYMMDD-HHMMSS.json`
- `<run-name>-YYYYMMDD-HHMMSS.html`

Latest shortcuts:
- `load-tests/reports/latest.html`
- `load-tests/reports/requests-create-latest.html` (and same pattern for other run names)

Example:
```powershell
node load-tests/requests-create-node.js
```
Then open:
`load-tests/reports/requests-create-latest.html`

## How to read the report

- `p95` means 95% of requests finished at or below that duration.
- Failed requests section shows backend/client problems:
  - `401` usually token/auth issue.
  - `400` usually validation/permissions/data issue (example: invalid target team).
  - `FETCH_ERR` means network/runtime failure in script.
- Use status counts + slowest requests to find bottlenecks and errors quickly.

## Recommended stages

1. Read: 100 / 10
2. Read: 1000 / 50
3. Create: 10 / 2
4. Create: 100 / 10
5. Mixed: 1000 / 50
6. Mixed: 5000 / 100
