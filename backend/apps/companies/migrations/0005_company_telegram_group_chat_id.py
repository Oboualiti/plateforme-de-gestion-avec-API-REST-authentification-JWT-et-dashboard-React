from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0004_alter_company_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='company',
            name='telegram_group_chat_id',
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
