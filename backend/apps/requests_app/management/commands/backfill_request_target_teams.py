from django.core.management.base import BaseCommand
from django.db.models import OuterRef, Subquery

from apps.permissions_app.models import UserRole
from apps.requests_app.models import RequestStatusHistory, ServiceRequest, Team


class Command(BaseCommand):
    help = "One-time backfill for ServiceRequest.target_team on legacy rows."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview changes without writing to the database.",
        )
        parser.add_argument(
            "--request-id",
            type=int,
            dest="request_id",
            help="Process only one request id.",
        )

    def _resolve_single_team_id(self, queryset):
        team_ids = list(queryset.values_list("id", flat=True).distinct()[:2])
        if len(team_ids) == 1:
            return team_ids[0], None
        if len(team_ids) > 1:
            return None, "multiple"
        return None, "none"

    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        request_id = options.get("request_id")

        completed_by_subquery = RequestStatusHistory.objects.filter(
            request_id=OuterRef("pk"),
            new_status=ServiceRequest.Status.COMPLETED,
        ).order_by("-changed_at")
        closed_by_subquery = RequestStatusHistory.objects.filter(
            request_id=OuterRef("pk"),
            new_status=ServiceRequest.Status.CLOSED,
        ).order_by("-changed_at")

        qs = ServiceRequest.objects.all().annotate(
            completed_by_id=Subquery(completed_by_subquery.values("changed_by_id")[:1]),
            closed_by_id=Subquery(closed_by_subquery.values("changed_by_id")[:1]),
        )
        if request_id:
            qs = qs.filter(id=request_id)

        scanned_count = 0
        updated_count = 0
        skipped_no_company_entity = 0
        skipped_no_solver = 0
        skipped_no_matching_team = 0
        skipped_multiple_matching_teams = 0
        already_had_target_team_count = 0

        for req in qs.order_by("id").iterator():
            scanned_count += 1

            if req.target_team_id:
                already_had_target_team_count += 1
                continue

            if not req.company_id or not req.target_entity_id:
                skipped_no_company_entity += 1
                self.stdout.write(
                    f"SKIP req={req.id}: missing company/target_entity (company_id={req.company_id}, entity_id={req.target_entity_id})"
                )
                continue

            matched_team_id = None

            if req.target_team_leader_id:
                team_qs = Team.objects.filter(
                    is_active=True,
                    leader_id=req.target_team_leader_id,
                    company_id=req.company_id,
                    entity_id=req.target_entity_id,
                )
                matched_team_id, match_state = self._resolve_single_team_id(team_qs)
                if match_state == "multiple":
                    skipped_multiple_matching_teams += 1
                    self.stdout.write(
                        f"SKIP req={req.id}: multiple teams for target_team_leader_id={req.target_team_leader_id}"
                    )
                    continue
                if match_state == "none":
                    skipped_no_matching_team += 1
                    self.stdout.write(
                        f"SKIP req={req.id}: no team for target_team_leader_id={req.target_team_leader_id}"
                    )
                    continue
            else:
                solver_id = req.completed_by_id or req.closed_by_id or req.current_assignee_id
                if not solver_id:
                    skipped_no_solver += 1
                    self.stdout.write(f"SKIP req={req.id}: no solver/completer found")
                    continue

                is_team_leader = UserRole.objects.filter(
                    user_id=solver_id,
                    role__key="team_leader",
                ).exists()

                if is_team_leader:
                    team_qs = Team.objects.filter(
                        is_active=True,
                        leader_id=solver_id,
                        company_id=req.company_id,
                        entity_id=req.target_entity_id,
                    )
                else:
                    team_qs = Team.objects.filter(
                        is_active=True,
                        members__id=solver_id,
                        company_id=req.company_id,
                        entity_id=req.target_entity_id,
                    )

                matched_team_id, match_state = self._resolve_single_team_id(team_qs)
                if match_state == "multiple":
                    skipped_multiple_matching_teams += 1
                    self.stdout.write(
                        f"SKIP req={req.id}: multiple teams for solver_id={solver_id}"
                    )
                    continue
                if match_state == "none":
                    skipped_no_matching_team += 1
                    self.stdout.write(f"SKIP req={req.id}: no team for solver_id={solver_id}")
                    continue

            if dry_run:
                updated_count += 1
                self.stdout.write(f"DRY-RUN req={req.id}: would set target_team_id={matched_team_id}")
            else:
                req.target_team_id = matched_team_id
                req.save(update_fields=["target_team"])
                updated_count += 1
                self.stdout.write(f"UPDATED req={req.id}: target_team_id={matched_team_id}")

        self.stdout.write("")
        self.stdout.write("Backfill summary")
        self.stdout.write(f"scanned count: {scanned_count}")
        self.stdout.write(f"updated count: {updated_count}")
        self.stdout.write(f"skipped no company/entity: {skipped_no_company_entity}")
        self.stdout.write(f"skipped no solver: {skipped_no_solver}")
        self.stdout.write(f"skipped no matching team: {skipped_no_matching_team}")
        self.stdout.write(f"skipped multiple matching teams: {skipped_multiple_matching_teams}")
        self.stdout.write(f"already had target_team count: {already_had_target_team_count}")
