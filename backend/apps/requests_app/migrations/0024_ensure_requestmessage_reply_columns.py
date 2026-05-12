from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("requests_app", "0023_requestmessage_reply_pin_fields"),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                """
                ALTER TABLE requests_app_requestmessage
                ADD COLUMN IF NOT EXISTS reply_to_comment_id integer NULL
                """,
                """
                ALTER TABLE requests_app_requestmessage
                ADD COLUMN IF NOT EXISTS telegram_message_id bigint NULL
                """,
                """
                ALTER TABLE requests_app_requestmessage
                ADD COLUMN IF NOT EXISTS telegram_reply_to_message_id bigint NULL
                """,
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'requests_app_requestmessage_reply_to_comment_id_fkey'
                    ) THEN
                        ALTER TABLE requests_app_requestmessage
                        ADD CONSTRAINT requests_app_requestmessage_reply_to_comment_id_fkey
                        FOREIGN KEY (reply_to_comment_id)
                        REFERENCES requests_app_requestmessage (id)
                        DEFERRABLE INITIALLY DEFERRED;
                    END IF;
                END $$;
                """,
            ],
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
