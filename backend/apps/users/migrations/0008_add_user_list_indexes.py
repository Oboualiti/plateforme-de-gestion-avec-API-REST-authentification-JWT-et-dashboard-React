from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0007_alter_user_id"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="user",
            index=models.Index(fields=["is_active"], name="user_active_idx"),
        ),
        migrations.AddIndex(
            model_name="user",
            index=models.Index(fields=["company", "is_active"], name="user_company_active_idx"),
        ),
        migrations.AddIndex(
            model_name="user",
            index=models.Index(fields=["entity", "is_active"], name="user_entity_active_idx"),
        ),
        migrations.AddIndex(
            model_name="user",
            index=models.Index(fields=["date_joined"], name="user_joined_idx"),
        ),
    ]

