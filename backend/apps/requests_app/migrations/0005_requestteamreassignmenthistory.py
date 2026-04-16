from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('entities', '0004_alter_entity_id'),
        ('requests_app', '0004_requestassignmenthistory_servicerequest_company_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='RequestTeamReassignmentHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('note', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('changed_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='request_team_reassignments_made', to=settings.AUTH_USER_MODEL)),
                ('new_target_entity', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='request_team_reassignments_to', to='entities.entity')),
                ('old_target_entity', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='request_team_reassignments_from', to='entities.entity')),
                ('request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='team_reassignment_history', to='requests_app.servicerequest')),
            ],
        ),
    ]
