from django.db import migrations


def ensure_scope_type_column(apps, schema_editor):
    table_name = "permissions_app_userpermissionoverride"
    with schema_editor.connection.cursor() as cursor:
        description = schema_editor.connection.introspection.get_table_description(
            cursor, table_name
        )
    existing_columns = {col.name for col in description}
    if "scope_type" in existing_columns:
        return
    schema_editor.execute(
        """
        ALTER TABLE permissions_app_userpermissionoverride
        ADD COLUMN scope_type varchar(20) NOT NULL DEFAULT 'GLOBAL'
        """
    )


class Migration(migrations.Migration):

    dependencies = [
        ("permissions_app", "0027_merge_20260511_0900"),
    ]

    operations = [
        migrations.RunPython(ensure_scope_type_column, migrations.RunPython.noop),
    ]

