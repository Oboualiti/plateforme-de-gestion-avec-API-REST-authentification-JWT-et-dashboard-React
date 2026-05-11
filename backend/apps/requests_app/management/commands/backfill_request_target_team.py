from django.core.management.base import BaseCommand
from django.db.models import OuterRef, Subquery

from apps.permissions_app.models import UserRole
from apps.requests_app.models import RequestStatusHistory, ServiceRequest, Team


class Command(BaseCommand):
    help = "Backfill ServiceRequest.target_team for legacy rows where it is null."

    def handle(self, *args, **options):
        completed_by_subquery = RequestStatusHistory.objects.filter(
            request_id=OuterRef("pk"),
            new_status=ServiceRequest.Status.COMPLETED,
        ).order_by("-changed_at")
        closed_by_subquery = RequestStatusHistory.objects.filter(
            request_id=OuterRef("pk"),
            new_status=ServiceRequest.Status.CLOSED,
        ).order_by("-changed_at")

        requests = (
            ServiceRequest.objects.filter(target_team__isnull=True)
            .select_related("target_team_leader", "target_entity", "company", "current_assignee")
            .annotate(
                completed_by_id=Subquery(completed_by_subquery.values("changed_by_id")[:1]),
                closed_by_id=Subquery(closed_by_subquery.values("changed_by_id")[:1]),
            )
            .order_by("id")
        )

        updated_count = 0
        skipped_no_solver_or_team_count = 0
        skipped_multiple_matches_count = 0
        skipped_no_match_count = 0
        ambiguous_request_ids = []

        for req in requests.iterator():
            if not req.target_entity_id or not req.company_id:
                skipped_no_solver_or_team_count += 1
                continue

            match_qs = None
            if req.target_team_leader_id:
                match_qs = Team.objects.filter(
                    is_active=True,
                    leader_id=req.target_team_leader_id,
                    entity_id=req.target_entity_id,
                    company_id=req.company_id,
                )
            else:
                solver_id = req.completed_by_id or req.closed_by_id or req.current_assignee_id
                if not solver_id:
                    skipped_no_solver_or_team_count += 1
                    continue

                is_solver_team_leader = UserRole.objects.filter(
                    user_id=solver_id,
                    role__key="team_leader",
                ).exists()
                if is_solver_team_leader:
                    match_qs = Team.objects.filter(
                        is_active=True,
                        leader_id=solver_id,
                        entity_id=req.target_entity_id,
                        company_id=req.company_id,
                    )
                else:
                    match_qs = Team.objects.filter(
                        is_active=True,
                        members__id=solver_id,
                        entity_id=req.target_entity_id,
                        company_id=req.company_id,
                    )

            match_ids = list(match_qs.values_list("id", flat=True).distinct()[:2])
            if len(match_ids) == 1:
                req.target_team_id = match_ids[0]
                req.save(update_fields=["target_team"])
                updated_count += 1
            elif len(match_ids) > 1:
                skipped_multiple_matches_count += 1
                ambiguous_request_ids.append(req.id)
            else:
                skipped_no_match_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                "Backfill target_team complete. "
                f"updated={updated_count}, "
                f"skipped_no_solver_or_team={skipped_no_solver_or_team_count}, "
                f"skipped_multiple_matches={skipped_multiple_matches_count}, "
                f"skipped_no_match={skipped_no_match_count}"
            )
        )
        if ambiguous_request_ids:
            self.stdout.write(
                "Ambiguous request ids: " + ", ".join(str(item) for item in ambiguous_request_ids)
            )
