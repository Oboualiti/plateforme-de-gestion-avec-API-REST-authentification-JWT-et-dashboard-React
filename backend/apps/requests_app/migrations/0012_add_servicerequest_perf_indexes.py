from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("requests_app", "0011_servicerequest_deadline_date"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="servicerequest",
            index=models.Index(fields=["status"], name="req_status_idx"),
        ),
        migrations.AddIndex(
            model_name="servicerequest",
            index=models.Index(fields=["created_at"], name="req_created_at_idx"),
        ),
        migrations.AddIndex(
            model_name="servicerequest",
            index=models.Index(
                fields=["requester_user", "created_at"],
                name="req_requester_created_idx",
            ),
        ),
    ]

