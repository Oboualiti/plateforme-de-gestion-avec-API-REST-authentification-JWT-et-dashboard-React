from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("requests_app", "0010_servicerequest_is_submitted_to_target"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicerequest",
            name="deadline_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
