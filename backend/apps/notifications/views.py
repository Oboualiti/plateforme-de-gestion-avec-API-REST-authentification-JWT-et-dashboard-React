from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserNotification
from .serializers import UserNotificationSerializer
from .services import mark_notification_read


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        unread_only = (request.query_params.get("unread_only") or "").strip().lower() in {
            "1",
            "true",
            "yes",
        }
        queryset = UserNotification.objects.filter(user=request.user)
        if unread_only:
            queryset = queryset.filter(is_read=False)
        queryset = queryset.order_by("-created_at")[:100]
        return Response(UserNotificationSerializer(queryset, many=True).data)


class NotificationUnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        unread_count = UserNotification.objects.filter(
            user=request.user, is_read=False
        ).count()
        return Response({"unread_count": unread_count})


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, notification_id):
        notification = UserNotification.objects.filter(
            id=notification_id, user=request.user
        ).first()
        if notification is None:
            return Response({"detail": "Notification not found."}, status=404)
        mark_notification_read(notification)
        return Response(UserNotificationSerializer(notification).data)


class NotificationReadAllView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = UserNotification.objects.filter(user=request.user, is_read=False).update(
            is_read=True,
            read_at=timezone.now(),
        )
        return Response({"updated": updated})
