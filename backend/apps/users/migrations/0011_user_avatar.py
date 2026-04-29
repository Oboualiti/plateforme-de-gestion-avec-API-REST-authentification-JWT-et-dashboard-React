from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0010_alter_user_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="avatar",
            field=models.ImageField(blank=True, null=True, upload_to="profile_avatars/"),
        ),
    ]

