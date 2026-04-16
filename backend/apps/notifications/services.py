from django.utils import timezone

from apps.users.models import User

from .models import UserNotification


def create_notification(
    *,
    user,
    event_type,
    title,
    message,
    link="",
    metadata=None,
):
    if user is None:
        return None
    return UserNotification.objects.create(
        user=user,
        event_type=event_type,
        title=title,
        message=message,
        link=link,
        metadata=metadata or {},
    )


def create_bulk_notifications(
    *,
    users,
    event_type,
    title,
    message,
    link="",
    metadata=None,
):
    notification_items = []
    for user in users:
        if user is None:
            continue
        notification_items.append(
            UserNotification(
                user=user,
                event_type=event_type,
                title=title,
                message=message,
                link=link,
                metadata=metadata or {},
            )
        )
    if notification_items:
        UserNotification.objects.bulk_create(notification_items)


def resolve_request_notification_recipients(service_request, exclude_user_id=None):
    recipient_ids = {service_request.requester_user_id}
    if service_request.current_assignee_id:
        recipient_ids.add(service_request.current_assignee_id)
    if service_request.source_entity_id:
        recipient_ids.update(
            User.objects.filter(
                company_id=getattr(service_request, "company_id", None)
                or service_request.requester_user.company_id,
                entity_id=service_request.source_entity_id,
                is_active=True,
            ).values_list("id", flat=True)
        )
    if service_request.target_entity_id:
        recipient_ids.update(
            User.objects.filter(
                company_id=getattr(service_request, "company_id", None)
                or service_request.requester_user.company_id,
                entity_id=service_request.target_entity_id,
                is_active=True,
            ).values_list("id", flat=True)
        )
    if exclude_user_id:
        recipient_ids.discard(exclude_user_id)
    if not recipient_ids:
        return User.objects.none()
    return User.objects.filter(id__in=recipient_ids, is_active=True)


def mark_notification_read(notification):
    if notification.is_read:
        return notification
    notification.is_read = True
    notification.read_at = timezone.now()
    notification.save(update_fields=["is_read", "read_at"])
    return notification
