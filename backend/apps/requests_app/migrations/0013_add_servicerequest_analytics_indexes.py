from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("requests_app", "0012_add_servicerequest_perf_indexes"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="servicerequest",
            index=models.Index(fields=["deadline_date"], name="req_deadline_idx"),
        ),
        migrations.AddIndex(
            model_name="servicerequest",
            index=models.Index(fields=["priority"], name="req_priority_idx"),
        ),
        migrations.AddIndex(
            model_name="servicerequest",
            index=models.Index(fields=["status", "created_at"], name="req_status_created_idx"),
        ),
        migrations.AddIndex(
            model_name="servicerequest",
            index=models.Index(fields=["company", "status"], name="req_company_status_idx"),
        ),
        migrations.AddIndex(
            model_name="servicerequest",
            index=models.Index(fields=["source_entity", "status"], name="req_source_status_idx"),
        ),
        migrations.AddIndex(
            model_name="servicerequest",
            index=models.Index(fields=["target_entity", "status"], name="req_target_status_idx"),
        ),
        migrations.AddIndex(
            model_name="servicerequest",
            index=models.Index(fields=["current_assignee", "status"], name="req_assignee_status_idx"),
        ),
        migrations.AddIndex(
            model_name="servicerequest",
            index=models.Index(fields=["requester_user", "status"], name="req_requester_status_idx"),
        ),
        migrations.AddIndex(
            model_name="servicerequest",
            index=models.Index(fields=["company", "created_at"], name="req_company_created_idx"),
        ),
        migrations.AddIndex(
            model_name="servicerequest",
            index=models.Index(fields=["target_entity", "created_at"], name="req_target_created_idx"),
        ),
    ]

