from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("requests_app", "0014_alter_mainbranch_id_alter_operationalunit_id_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="requestmessage",
            name="edited_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]

