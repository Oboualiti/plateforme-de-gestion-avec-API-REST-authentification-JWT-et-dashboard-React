from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("entities", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="entity",
            name="entity_type",
            field=models.CharField(
                choices=[
                    ("PROD", "Production"),
                    ("SUPPORT", "Support"),
                    ("TDEV", "Technical Development"),
                ],
                default="PROD",
                max_length=20,
            ),
        ),
    ]
