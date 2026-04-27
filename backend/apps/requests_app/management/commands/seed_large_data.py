import csv
import io
import random
import time
from dataclasses import dataclass
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.db.models import Count
from django.utils import timezone

from apps.companies.models import Company
from apps.entities.models import Entity
from apps.requests_app.models import MainBranch, OperationalUnit, ServiceRequest
from apps.users.models import User


@dataclass
class SeedPools:
    requester_pool: list
    target_pool: list
    assignee_ids: list


class Command(BaseCommand):
    help = "Generate and insert large realistic request data in batches (bulk_create or PostgreSQL COPY)."

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, default=100000, help="Total rows to create for this run.")
        parser.add_argument("--batch", type=int, default=10000, help="Rows per batch insert.")
        parser.add_argument(
            "--mode",
            choices=["bulk", "copy"],
            default="bulk",
            help="Insertion mode: Django bulk_create or PostgreSQL COPY.",
        )
        parser.add_argument(
            "--run-id",
            type=str,
            default=timezone.now().strftime("%Y%m%d"),
            help="Stable run identifier used in request_number prefix (restart-safe).",
        )
        parser.add_argument(
            "--days-back",
            type=int,
            default=365,
            help="How many days in the past to spread generated data across.",
        )
        parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible generation.")
        parser.add_argument(
            "--unassigned-rate",
            type=float,
            default=0.25,
            help="Probability (0-1) that a generated request is unassigned.",
        )
        parser.add_argument(
            "--bootstrap-users-per-entity",
            type=int,
            default=20,
            help="Minimum active users per entity to ensure realistic assignment pools.",
        )
        parser.add_argument(
            "--bootstrap-companies",
            type=int,
            default=2,
            help="Companies to create only if database lacks enough active companies.",
        )
        parser.add_argument(
            "--bootstrap-prod-entities",
            type=int,
            default=4,
            help="Production entities to create per bootstrap company if needed.",
        )
        parser.add_argument(
            "--bootstrap-target-entities",
            type=int,
            default=4,
            help="Support/TDEV entities to create per bootstrap company if needed.",
        )

    def handle(self, *args, **options):
        try:
            from faker import Faker
        except ImportError as exc:
            raise CommandError(
                "Faker is required. Install with: pip install Faker"
            ) from exc

        count = options["count"]
        batch_size = options["batch"]
        mode = options["mode"]
        run_id = options["run_id"].strip()
        days_back = options["days_back"]
        seed = options["seed"]
        unassigned_rate = options["unassigned_rate"]

        if count <= 0:
            raise CommandError("--count must be > 0")
        if batch_size <= 0:
            raise CommandError("--batch must be > 0")
        if days_back <= 0:
            raise CommandError("--days-back must be > 0")
        if not (0 <= unassigned_rate <= 1):
            raise CommandError("--unassigned-rate must be between 0 and 1")
        if not run_id:
            raise CommandError("--run-id cannot be empty")

        randomizer = random.Random(seed)
        faker = Faker()
        faker.seed_instance(seed)

        self.stdout.write(self.style.NOTICE("Preparing seed foundation (companies/entities/units/users)..."))
        self._ensure_seed_foundation(
            randomizer=randomizer,
            faker=faker,
            bootstrap_companies=options["bootstrap_companies"],
            bootstrap_prod_entities=options["bootstrap_prod_entities"],
            bootstrap_target_entities=options["bootstrap_target_entities"],
            bootstrap_users_per_entity=options["bootstrap_users_per_entity"],
        )
        pools = self._build_pools()

        if not pools.requester_pool:
            raise CommandError("No eligible requesters found. Ensure active users linked to PROD entities.")
        if not pools.target_pool:
            raise CommandError("No eligible target entities found (SUPPORT/TDEV).")

        prefix = f"LRD-{run_id}-"
        existing = ServiceRequest.objects.filter(request_number__startswith=prefix).count()
        if existing >= count:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Run '{run_id}' already has {existing} rows (requested {count}). Nothing to do."
                )
            )
            return

        start_index = existing
        remaining = count - existing
        self.stdout.write(
            self.style.NOTICE(
                f"Run '{run_id}': existing={existing}, target={count}, to_insert={remaining}, "
                f"batch={batch_size}, mode={mode}"
            )
        )

        if mode == "copy" and connection.vendor != "postgresql":
            self.stdout.write(
                self.style.WARNING("COPY mode requires PostgreSQL. Falling back to bulk mode.")
            )
            mode = "bulk"

        total_inserted = 0
        started = time.perf_counter()
        now = timezone.now()

        while total_inserted < remaining:
            current_batch = min(batch_size, remaining - total_inserted)
            global_start = start_index + total_inserted
            records = [
                self._generate_record_data(
                    faker=faker,
                    randomizer=randomizer,
                    now=now,
                    days_back=days_back,
                    unassigned_rate=unassigned_rate,
                    pools=pools,
                    request_number=f"{prefix}{global_start + idx + 1:012d}",
                )
                for idx in range(current_batch)
            ]

            if mode == "copy":
                self._insert_batch_copy(records)
            else:
                self._insert_batch_bulk(records)

            total_inserted += current_batch
            self._print_progress(total_inserted, remaining, started)

        elapsed = time.perf_counter() - started
        rate = (total_inserted / elapsed) if elapsed > 0 else 0
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Inserted {total_inserted} rows for run '{run_id}' in {elapsed:.2f}s ({rate:,.0f} rows/sec)."
            )
        )

    def _ensure_seed_foundation(
        self,
        *,
        randomizer,
        faker,
        bootstrap_companies,
        bootstrap_prod_entities,
        bootstrap_target_entities,
        bootstrap_users_per_entity,
    ):
        active_companies = list(Company.objects.filter(is_active=True))
        if len(active_companies) < bootstrap_companies:
            missing = bootstrap_companies - len(active_companies)
            self._create_companies(missing)
            active_companies = list(Company.objects.filter(is_active=True))

        for company in active_companies:
            self._ensure_entities_for_company(
                company=company,
                prod_min=bootstrap_prod_entities,
                target_min=bootstrap_target_entities,
            )

        active_entities = list(Entity.objects.filter(is_active=True).select_related("company"))
        self._ensure_units(active_entities)
        self._ensure_users_for_entities(
            entities=active_entities,
            randomizer=randomizer,
            faker=faker,
            minimum=bootstrap_users_per_entity,
        )

    def _create_companies(self, missing):
        existing_codes = set(Company.objects.values_list("code", flat=True))
        to_create = []
        cursor = 1
        while len(to_create) < missing:
            code = f"LT{cursor:02d}"
            cursor += 1
            if code in existing_codes:
                continue
            existing_codes.add(code)
            to_create.append(Company(code=code, name=f"LoadTest {code}", is_active=True))
        Company.objects.bulk_create(to_create, batch_size=1000)

    def _ensure_entities_for_company(self, *, company, prod_min, target_min):
        current = list(Entity.objects.filter(company=company, is_active=True))
        prod_count = sum(1 for item in current if item.entity_type == Entity.EntityType.PROD)
        target_count = sum(
            1 for item in current if item.entity_type in {Entity.EntityType.SUPPORT, Entity.EntityType.TDEV}
        )

        to_create = []
        existing_codes = set(Entity.objects.values_list("code", flat=True))

        for idx in range(prod_count, prod_min):
            code = self._next_entity_code(company.code, "P", idx + 1, existing_codes)
            to_create.append(
                Entity(
                    company=company,
                    name=f"{company.code} PROD {idx + 1}",
                    code=code,
                    entity_type=Entity.EntityType.PROD,
                    is_active=True,
                )
            )
        for idx in range(target_count, target_min):
            kind = Entity.EntityType.SUPPORT if idx % 2 == 0 else Entity.EntityType.TDEV
            marker = "S" if kind == Entity.EntityType.SUPPORT else "D"
            code = self._next_entity_code(company.code, marker, idx + 1, existing_codes)
            to_create.append(
                Entity(
                    company=company,
                    name=f"{company.code} {kind} {idx + 1}",
                    code=code,
                    entity_type=kind,
                    is_active=True,
                )
            )

        if to_create:
            Entity.objects.bulk_create(to_create, batch_size=1000)

    def _ensure_units(self, entities):
        branch, _ = MainBranch.objects.get_or_create(name="LOADTEST")
        entity_by_code = {item.code: item for item in entities}
        existing_units = {
            item.code: item
            for item in OperationalUnit.objects.filter(code__in=entity_by_code.keys())
        }
        to_create = []
        for code, entity in entity_by_code.items():
            if code in existing_units:
                continue
            team_type = self._team_type_for_entity(entity.entity_type)
            to_create.append(
                OperationalUnit(
                    main_branch=branch,
                    code=code,
                    name=entity.name,
                    team_type=team_type,
                    is_active=True,
                )
            )
        if to_create:
            OperationalUnit.objects.bulk_create(to_create, batch_size=1000)

    def _ensure_users_for_entities(self, *, entities, randomizer, faker, minimum):
        if minimum <= 0:
            return
        entity_ids = [item.id for item in entities]
        existing_counts = {}
        for row in (
            User.objects.filter(is_active=True, entity_id__in=entity_ids)
            .values("entity_id")
            .order_by()
            .annotate(count=Count("id"))
        ):
            existing_counts[row["entity_id"]] = row["count"]

        to_create = []
        existing_usernames = set(User.objects.values_list("username", flat=True))
        for entity in entities:
            have = existing_counts.get(entity.id, 0)
            needed = max(0, minimum - have)
            for idx in range(needed):
                username = self._next_username(
                    base=f"lt_{entity.code.lower()}",
                    existing=existing_usernames,
                    randomizer=randomizer,
                )
                to_create.append(
                    User(
                        username=username,
                        first_name=faker.first_name(),
                        last_name=faker.last_name(),
                        email=f"{username}@loadtest.local",
                        company=entity.company,
                        entity=entity,
                        is_active=True,
                        job_title=randomizer.choice(["Engineer", "Analyst", "Operator", "Specialist"]),
                    )
                )
                if len(to_create) >= 5000:
                    User.objects.bulk_create(to_create, batch_size=1000)
                    to_create = []
        if to_create:
            User.objects.bulk_create(to_create, batch_size=1000)

    def _build_pools(self):
        units = {
            row["code"]: row["id"]
            for row in OperationalUnit.objects.values("id", "code")
        }
        entities = list(
            Entity.objects.filter(is_active=True).values(
                "id", "company_id", "code", "entity_type"
            )
        )
        entity_map = {item["id"]: item for item in entities}

        prod_entity_ids = [
            item["id"] for item in entities if item["entity_type"] == Entity.EntityType.PROD
        ]
        target_entity_ids = [
            item["id"]
            for item in entities
            if item["entity_type"] in {Entity.EntityType.SUPPORT, Entity.EntityType.TDEV}
        ]

        requester_pool = []
        requester_rows = User.objects.filter(
            is_active=True,
            entity_id__in=prod_entity_ids,
        ).values("id", "company_id", "entity_id")
        for row in requester_rows:
            unit_id = units.get(entity_map[row["entity_id"]]["code"])
            if not unit_id:
                continue
            requester_pool.append(
                {
                    "user_id": row["id"],
                    "company_id": row["company_id"] or entity_map[row["entity_id"]]["company_id"],
                    "source_entity_id": row["entity_id"],
                    "requester_unit_id": unit_id,
                }
            )

        target_pool = []
        for entity_id in target_entity_ids:
            code = entity_map[entity_id]["code"]
            unit_id = units.get(code)
            if unit_id:
                target_pool.append({"target_entity_id": entity_id, "target_unit_id": unit_id})

        assignee_ids = list(
            User.objects.filter(is_active=True, entity_id__in=target_entity_ids).values_list("id", flat=True)
        )
        if not assignee_ids:
            assignee_ids = list(User.objects.filter(is_active=True).values_list("id", flat=True))

        return SeedPools(
            requester_pool=requester_pool,
            target_pool=target_pool,
            assignee_ids=assignee_ids,
        )

    def _generate_record_data(
        self,
        *,
        faker,
        randomizer,
        now,
        days_back,
        unassigned_rate,
        pools,
        request_number,
    ):
        requester = randomizer.choice(pools.requester_pool)
        target = randomizer.choice(pools.target_pool)
        status = randomizer.choices(
            population=[
                ServiceRequest.Status.NEW,
                ServiceRequest.Status.IN_PROGRESS,
                ServiceRequest.Status.COMPLETED,
                ServiceRequest.Status.CLOSED,
                ServiceRequest.Status.REJECTED,
            ],
            weights=[40, 30, 15, 10, 5],
            k=1,
        )[0]

        created_at = now - timedelta(
            days=randomizer.uniform(0, days_back),
            seconds=randomizer.randint(0, 86399),
        )
        accepted_at = None
        completed_at = None
        closed_at = None

        if status in {
            ServiceRequest.Status.ACCEPTED,
            ServiceRequest.Status.IN_PROGRESS,
            ServiceRequest.Status.COMPLETED,
            ServiceRequest.Status.CLOSED,
        }:
            accepted_at = created_at + timedelta(
                hours=randomizer.randint(1, 72),
                minutes=randomizer.randint(0, 59),
            )

        if status in {ServiceRequest.Status.COMPLETED, ServiceRequest.Status.CLOSED}:
            completed_at = (accepted_at or created_at) + timedelta(
                days=randomizer.randint(1, 30),
                hours=randomizer.randint(0, 12),
            )

        if status == ServiceRequest.Status.CLOSED:
            closed_at = (completed_at or accepted_at or created_at) + timedelta(
                hours=randomizer.randint(1, 96),
            )

        deadline_date = None
        if randomizer.random() < 0.8:
            deadline_date = (created_at + timedelta(days=randomizer.randint(3, 45))).date()

        assignee_id = None
        if status not in {ServiceRequest.Status.NEW, ServiceRequest.Status.REJECTED} and randomizer.random() >= unassigned_rate:
            assignee_id = randomizer.choice(pools.assignee_ids) if pools.assignee_ids else None

        return {
            "request_number": request_number,
            "title": faker.sentence(nb_words=6)[:255],
            "description": faker.paragraph(nb_sentences=3),
            "category": randomizer.choice(["INFO", "SCRIPT", "TOOL", "APP_PROJECT", "OTHER"]),
            "priority": randomizer.choices(
                [ServiceRequest.Priority.LOW, ServiceRequest.Priority.MEDIUM, ServiceRequest.Priority.HIGH],
                [25, 55, 20],
                k=1,
            )[0],
            "requester_user_id": requester["user_id"],
            "company_id": requester["company_id"],
            "source_entity_id": requester["source_entity_id"],
            "target_entity_id": target["target_entity_id"],
            "requester_unit_id": requester["requester_unit_id"],
            "target_unit_id": target["target_unit_id"],
            "status": status,
            "is_submitted_to_target": randomizer.random() >= 0.05,
            "current_assignee_id": assignee_id,
            "rejection_reason": faker.sentence(nb_words=10) if status == ServiceRequest.Status.REJECTED else "",
            "resolution_note": (
                faker.sentence(nb_words=10)
                if status in {ServiceRequest.Status.COMPLETED, ServiceRequest.Status.CLOSED, ServiceRequest.Status.REJECTED}
                else ""
            ),
            "created_at": created_at,
            "accepted_at": accepted_at,
            "deadline_date": deadline_date,
            "completed_at": completed_at,
            "closed_at": closed_at,
        }

    def _insert_batch_bulk(self, records):
        instances = [ServiceRequest(**row) for row in records]
        with transaction.atomic():
            ServiceRequest.objects.bulk_create(instances, batch_size=len(instances))

    def _insert_batch_copy(self, records):
        table = ServiceRequest._meta.db_table
        columns = [
            "request_number",
            "title",
            "description",
            "category",
            "priority",
            "requester_user_id",
            "company_id",
            "source_entity_id",
            "target_entity_id",
            "requester_unit_id",
            "target_unit_id",
            "status",
            "is_submitted_to_target",
            "current_assignee_id",
            "rejection_reason",
            "resolution_note",
            "created_at",
            "accepted_at",
            "deadline_date",
            "completed_at",
            "closed_at",
        ]
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        for row in records:
            writer.writerow(
                [
                    self._copy_value(row.get(col))
                    for col in columns
                ]
            )
        buffer.seek(0)
        sql = (
            f"COPY {table} ({', '.join(columns)}) "
            "FROM STDIN WITH (FORMAT csv, NULL '\\N')"
        )
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.copy_expert(sql, buffer)

    def _copy_value(self, value):
        if value is None:
            return r"\N"
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return value

    def _print_progress(self, inserted, total, started):
        elapsed = max(0.001, time.perf_counter() - started)
        rate = inserted / elapsed
        remaining = total - inserted
        eta_sec = remaining / rate if rate > 0 else 0
        self.stdout.write(
            f"[seed_large_data] inserted {inserted:,}/{total:,} "
            f"({(inserted / total) * 100:.1f}%) - {rate:,.0f} rows/s - ETA {eta_sec:.1f}s"
        )

    def _team_type_for_entity(self, entity_type):
        if entity_type == Entity.EntityType.SUPPORT:
            return OperationalUnit.TeamType.SUPPORT
        if entity_type == Entity.EntityType.TDEV:
            return OperationalUnit.TeamType.TDEV
        return OperationalUnit.TeamType.PROD

    def _next_entity_code(self, company_code, marker, index, existing_codes):
        cursor = index
        while True:
            code = f"{company_code}-{marker}{cursor:02d}"
            if code not in existing_codes:
                existing_codes.add(code)
                return code
            cursor += 1

    def _next_username(self, *, base, existing, randomizer):
        while True:
            suffix = randomizer.randint(1000, 9999999)
            username = f"{base}_{suffix}"
            if username not in existing:
                existing.add(username)
                return username
