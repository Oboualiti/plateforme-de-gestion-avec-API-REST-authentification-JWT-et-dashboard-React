## Selection 1

### What now works

- When replying in app discussion, backend now receives `reply_to_comment_id`.
- Telegram mirror uses that mapping to send the message as an actual Telegram reply (`reply_to_message_id`) when possible.
- Pin/Unpin in app now also pins/unpins the corresponding Telegram message.

### Code changes

- Added `RequestMessage` fields:
  - `reply_to`
  - `telegram_message_id`
  - (plus previous pin fields already added)
- Added migration:
  - `0019_requestmessage_telegram_reply_fields.py`
- Updated comment create serializer to accept `reply_to_comment_id`.
- Updated comment create view to validate/store `reply_to`.
- Updated Telegram integration:
  - save returned Telegram `message_id`
  - send replies with `reply_to_message_id`
  - added Telegram pin/unpin helpers
- Updated pin endpoint to sync pin/unpin to Telegram.
- Frontend now sends `reply_to_comment_id` in reply submit.

### Files updated

- `models.py`
- `serializers.py`
- `views.py`
- `telegram.py`
- `RequestDetailsPage.jsx`
- `0019_requestmessage_telegram_reply_fields.py`

### Validation

- Frontend build passed.
- Django check passed (only existing project warnings unrelated to this feature).

### Important next step

