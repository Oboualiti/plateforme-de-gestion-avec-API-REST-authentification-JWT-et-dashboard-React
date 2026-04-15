from django.db.models import Max
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.permissions_app.services import (
    get_primary_role_key,
    get_request_scope_filter,
    get_user_role_keys,
)

from .models import (
    MainBranch,
    OperationalUnit,
    RequestMessage,
    RequestStatusHistory,
    ServiceRequest,
    UnitMembership,
)
from .serializers import (
    MainBranchSerializer,
    OperationalUnitSerializer,
    RequestCommentCreateSerializer,
    RequestDetailSerializer,
    RequestMessageSerializer,
    RequestStatusUpdateSerializer,
    RequestStatusHistorySerializer,
    RequestSummarySerializer,
    RequestCreateSerializer,
    ServiceRequestSerializer,
    UnitMembershipSerializer,
)


class MainBranchViewSet(viewsets.ModelViewSet):
    queryset = MainBranch.objects.all().order_by("-id")
    serializer_class = MainBranchSerializer


class OperationalUnitViewSet(viewsets.ModelViewSet):
    queryset = OperationalUnit.objects.all().order_by("-id")
    serializer_class = OperationalUnitSerializer


class UnitMembershipViewSet(viewsets.ModelViewSet):
    queryset = UnitMembership.objects.all().order_by("-id")
    serializer_class = UnitMembershipSerializer


class ServiceRequestViewSet(viewsets.ModelViewSet):
    queryset = ServiceRequest.objects.all().order_by("-id")
    serializer_class = ServiceRequestSerializer


class RequestStatusHistoryViewSet(viewsets.ModelViewSet):
    queryset = RequestStatusHistory.objects.all().order_by("-id")
    serializer_class = RequestStatusHistorySerializer


class RequestMessageViewSet(viewsets.ModelViewSet):
    queryset = RequestMessage.objects.all().order_by("-id")
    serializer_class = RequestMessageSerializer


class RequestListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role_key = get_primary_role_key(request.user)
        scope_filter = get_request_scope_filter(request.user)
        queryset = (
            ServiceRequest.objects.filter(scope_filter)
            .select_related("target_unit")
            .order_by("-created_at")
        )
        if role_key == "user":
            queryset = queryset.filter(requester_user=request.user)
        return Response(RequestSummarySerializer(queryset, many=True).data)

    def post(self, request):
        serializer = RequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target_unit = OperationalUnit.objects.filter(
            id=serializer.validated_data["target_team"]
        ).first()
        if target_unit is None:
            return Response(
                {"detail": "Target team not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        requester_unit = (
            request.user.unit_memberships.select_related("unit").first().unit
            if request.user.unit_memberships.exists()
            else target_unit
        )

        latest_id = ServiceRequest.objects.aggregate(max_id=Max("id"))["max_id"] or 0
        service_request = ServiceRequest.objects.create(
            request_number=f"REQ-{latest_id + 1:05d}",
            title=serializer.validated_data["title"],
            description=serializer.validated_data["description"],
            category=serializer.validated_data["type"],
            priority=serializer.validated_data["priority"],
            requester_user=request.user,
            requester_unit=requester_unit,
            target_unit=target_unit,
        )
        return Response(
            RequestDetailSerializer(service_request, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class RequestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def has_access(self, user, service_request):
        return ServiceRequest.objects.filter(
            get_request_scope_filter(user), id=service_request.id
        ).exists()

    def get_object(self, request_id):
        return (
            ServiceRequest.objects.select_related(
                "target_unit", "requester_user", "current_assignee"
            )
            .prefetch_related("messages__sender", "status_history__changed_by")
            .filter(id=request_id)
            .first()
        )

    def get(self, request, request_id):
        service_request = self.get_object(request_id)
        if service_request is None or not self.has_access(request.user, service_request):
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            RequestDetailSerializer(service_request, context={"request": request}).data
        )


class RequestCommentCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def has_access(self, user, service_request):
        return ServiceRequest.objects.filter(
            get_request_scope_filter(user), id=service_request.id
        ).exists()

    def post(self, request, request_id):
        service_request = ServiceRequest.objects.filter(id=request_id).first()
        if service_request is None or not self.has_access(request.user, service_request):
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = RequestCommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        RequestMessage.objects.create(
            request=service_request,
            sender=request.user,
            message=serializer.validated_data["message"],
        )
        service_request = (
            ServiceRequest.objects.select_related(
                "target_unit", "requester_user", "current_assignee"
            )
            .prefetch_related("messages__sender", "status_history__changed_by")
            .get(id=request_id)
        )
        return Response(
            RequestDetailSerializer(service_request, context={"request": request}).data
        )


class RequestStatusUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    allowed_roles = {"senior", "manager", "team_leader", "super_admin"}

    def post(self, request, request_id):
        role_keys = set(get_user_role_keys(request.user))
        if not role_keys.intersection(self.allowed_roles):
            return Response(
                {"detail": "You cannot update request status."},
                status=status.HTTP_403_FORBIDDEN,
            )

        service_request = ServiceRequest.objects.filter(id=request_id).first()
        if service_request is None:
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        if not ServiceRequest.objects.filter(
            get_request_scope_filter(request.user),
            id=service_request.id,
        ).exists():
            return Response(
                {"detail": "You cannot update this request."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RequestStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        old_status = service_request.status
        new_status = serializer.validated_data["status"]
        service_request.status = new_status
        if service_request.current_assignee_id is None:
            service_request.current_assignee = request.user
        service_request.save(update_fields=["status", "current_assignee"])
        RequestStatusHistory.objects.create(
            request=service_request,
            old_status=old_status,
            new_status=new_status,
            changed_by=request.user,
            note=serializer.validated_data.get("note", ""),
        )
        service_request = (
            ServiceRequest.objects.select_related(
                "target_unit", "requester_user", "current_assignee"
            )
            .prefetch_related("messages__sender", "status_history__changed_by")
            .get(id=request_id)
        )
        return Response(
            RequestDetailSerializer(service_request, context={"request": request}).data
        )
