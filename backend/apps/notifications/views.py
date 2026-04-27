from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.permissions_app.services import has_permission

from .models import UserNotification
from .serializers import UserNotificationSerializer
from .services import mark_notification_read


def _visible_notifications_queryset(user):
    queryset = UserNotification.objects.filter(user=user)
    if not has_permission(user, "view_request_discussion"):
        queryset = queryset.exclude(
            event_type=UserNotification.EventType.REQUEST_MESSAGE
        )
    return queryset


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        unread_only = (request.query_params.get("unread_only") or "").strip().lower() in {
            "1",
            "true",
            "yes",
        }
        queryset = _visible_notifications_queryset(request.user)
        if unread_only:
            queryset = queryset.filter(is_read=False)
        queryset = queryset.order_by("-created_at")[:100]
        return Response(UserNotificationSerializer(queryset, many=True).data)


class NotificationUnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        unread_count = _visible_notifications_queryset(request.user).filter(
            is_read=False
        ).count()
        return Response({"unread_count": unread_count})


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, notification_id):
        notification = _visible_notifications_queryset(request.user).filter(
            id=notification_id
        ).first()
        if notification is None:
            return Response({"detail": "Notification not found."}, status=404)
        mark_notification_read(notification)
        return Response(UserNotificationSerializer(notification).data)


class NotificationReadAllView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = _visible_notifications_queryset(request.user).filter(
            is_read=False
        ).update(
            is_read=True,
            read_at=timezone.now(),
        )
        return Response({"updated": updated})
