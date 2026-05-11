from django.db import migrations


def backfill_teams_and_requests(apps, schema_editor):
    User = apps.get_model("users", "User")
    Team = apps.get_model("requests_app", "Team")
    ServiceRequest = apps.get_model("requests_app", "ServiceRequest")
    UserRole = apps.get_model("permissions_app", "UserRole")

    team_leader_ids = set(
        UserRole.objects.filter(role__key="team_leader", user__is_active=True).values_list(
            "user_id", flat=True
        )
    )
    if not team_leader_ids:
        return

    leaders = User.objects.filter(id__in=team_leader_ids, is_active=True).only(
        "id", "username", "company_id", "entity_id"
    )

    leader_to_team = {}
    for leader in leaders:
        team = (
            Team.objects.filter(leader_id=leader.id, is_active=True)
            .order_by("id")
            .first()
        )
        if team is None:
            team = Team.objects.create(
                name=f"{leader.username}'s Team",
                company_id=leader.company_id,
                entity_id=leader.entity_id,
                leader_id=leader.id,
                is_active=True,
            )
        leader_to_team[leader.id] = team.id

    for leader_id, team_id in leader_to_team.items():
        member_ids = list(
            User.objects.filter(team_leader_id=leader_id, is_active=True).values_list(
                "id", flat=True
            )
        )
        if member_ids:
            Team.members.through.objects.bulk_create(
                [
                    Team.members.through(team_id=team_id, user_id=member_id)
                    for member_id in member_ids
                ],
                ignore_conflicts=True,
            )

    requests = ServiceRequest.objects.filter(target_team_leader_id__isnull=False, target_team_id__isnull=True).only(
        "id", "target_team_leader_id"
    )
    updates = []
    for req in requests:
        team_id = leader_to_team.get(req.target_team_leader_id)
        if team_id:
            req.target_team_id = team_id
            updates.append(req)
    if updates:
        ServiceRequest.objects.bulk_update(updates, ["target_team"])


class Migration(migrations.Migration):

    dependencies = [
        ("permissions_app", "0027_merge_20260511_0900"),
        ("requests_app", "0020_team_servicerequest_target_team_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_teams_and_requests, migrations.RunPython.noop),
    ]
