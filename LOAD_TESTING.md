# Large-Scale Seeding And Load Testing

## 1) Install dependencies

From `request_project/backend`:

```bash
pip install -r requirements.txt
```

If you do not use `requirements.txt`:

```bash
pip install Faker locust
```

## 2) Apply migrations (includes performance indexes)

From `request_project/backend`:

```bash
python manage.py migrate
```

This adds indexes on `ServiceRequest` for:
- `status`
- `created_at`
- `(requester_user, created_at)`

These indexes reduce full table scans on large datasets for:
- list/filter endpoints (`status`, `created_at`)
- requester-scoped queries and timeline ordering (`requester_user`, `created_at`)

## 3) Seed large data

From `request_project/backend`:

```bash
python manage.py seed_large_data --count 2000000 --batch 10000
```

Available options:

```bash
python manage.py seed_large_data \
  --count 3000000 \
  --batch 10000 \
  --mode bulk \
  --run-id april27 \
  --days-back 365 \
  --seed 42 \
  --unassigned-rate 0.25
```

Optional PostgreSQL ultra-fast mode:

```bash
python manage.py seed_large_data --count 3000000 --batch 20000 --mode copy
```

Notes:
- `run-id` makes generation restart-safe.
- Requests are generated with prefix: `LRD-<run-id>-...`
- Re-running same `run-id` continues from existing count.

## 4) Start API and run Locust

From `request_project/backend`:

```bash
python manage.py runserver
```

From `request_project` (where `locustfile.py` is located):

```bash
set LOCUST_USERNAME=superadmin
set LOCUST_PASSWORD=test12345
set LOCUST_API_PREFIX=/api
locust
```

Then open Locust UI: `http://localhost:8089`.

## 5) What Locust simulates

- List requests with pagination
- Filter by status
- Dashboard endpoint
- Reports endpoint
- Create request (role-aware payload for super admin / senior / others)

## 6) Expected timings (rough estimates)

These depend on CPU, disk, PostgreSQL tuning, and concurrent load.

- 100k rows:
  - `bulk` mode: ~20s to 90s
  - `copy` mode: ~8s to 40s
- 1M rows:
  - `bulk` mode: ~4m to 15m
  - `copy` mode: ~1.5m to 6m
- 3M rows:
  - `bulk` mode: ~12m to 45m
  - `copy` mode: ~5m to 18m

## 7) Bottlenecks to monitor

- PostgreSQL CPU saturation
- RAM pressure (PostgreSQL shared buffers + OS cache)
- Disk I/O / WAL write throughput
- Slow queries in list/filter/dashboard/report endpoints
- Lock contention during very large writes

Recommended checks:
- `pg_stat_activity`
- `pg_stat_statements`
- `EXPLAIN (ANALYZE, BUFFERS)` on slow queries

## 8) Scale further (5M+)

- Prefer `--mode copy` for massive inserts
- Increase `--batch` carefully (10k to 50k) after measuring
- Disable/reduce non-essential side effects during seed jobs
- Run seeding off-peak
- Partition `ServiceRequest` by time for very large datasets
- Add read replicas for heavy analytics dashboards
- Use materialized views / pre-aggregated tables for expensive dashboards

