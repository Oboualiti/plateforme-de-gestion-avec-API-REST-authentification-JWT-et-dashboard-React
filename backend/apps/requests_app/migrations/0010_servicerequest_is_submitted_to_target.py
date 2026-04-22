from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("requests_app", "0009_alter_mainbranch_id_alter_operationalunit_id_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicerequest",
            name="is_submitted_to_target",
            field=models.BooleanField(default=True),
        ),
    ]

