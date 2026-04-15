from django.db.models import Max
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.entities.models import Entity
from apps.permissions_app.services import get_user_role_keys

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

    def get_or_create_unit_for_entity(self, entity):
        main_branch, _ = MainBranch.objects.get_or_create(name=entity.company.code)
        team_type_map = {
            Entity.EntityType.PROD: OperationalUnit.TeamType.PROD,
            Entity.EntityType.SUPPORT: OperationalUnit.TeamType.SUPPORT,
            Entity.EntityType.TDEV: OperationalUnit.TeamType.TDEV,
        }
        unit, _ = OperationalUnit.objects.get_or_create(
            code=entity.code,
            defaults={
                "main_branch": main_branch,
                "name": entity.name,
                "team_type": team_type_map[entity.entity_type],
            },
        )
        changed = False
        expected_type = team_type_map[entity.entity_type]
        if unit.main_branch_id != main_branch.id:
            unit.main_branch = main_branch
            changed = True
        if unit.name != entity.name:
            unit.name = entity.name
            changed = True
        if unit.team_type != expected_type:
            unit.team_type = expected_type
            changed = True
        if changed:
            unit.save()
        return unit

    def get(self, request):
        queryset = get_visible_requests_queryset(request.user)
        return Response(RequestSummarySerializer(queryset, many=True).data)

    def post(self, request):
        if not request.user.company_id or not request.user.entity_id:
            return Response(
                {"detail": "You must belong to a company and source entity to create requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if request.user.entity.entity_type != Entity.EntityType.PROD:
            return Response(
                {"detail": "Only users from production entities can create requests."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target_entity = Entity.objects.filter(
            id=serializer.validated_data["target_team"],
            company_id=request.user.company_id,
            is_active=True,
        ).first()
        if target_entity is None:
            return Response(
                {"detail": "Target team not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target_entity.entity_type == Entity.EntityType.PROD:
            return Response(
                {
                    "detail": "Target team must be a support or development entity from your company."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        requester_unit = self.get_or_create_unit_for_entity(request.user.entity)
        target_unit = self.get_or_create_unit_for_entity(target_entity)

        latest_id = ServiceRequest.objects.aggregate(max_id=Max("id"))["max_id"] or 0
        service_request = ServiceRequest.objects.create(
            request_number=f"REQ-{latest_id + 1:05d}",
            title=serializer.validated_data["title"],
            description=serializer.validated_data["description"],
            category=serializer.validated_data["type"],
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
        return get_visible_requests_queryset(user).filter(id=service_request.id).exists()

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
        return get_visible_requests_queryset(user).filter(id=service_request.id).exists()

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

    def post(self, request, request_id):
        service_request = ServiceRequest.objects.filter(id=request_id).first()
        if service_request is None:
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        if not get_visible_requests_queryset(request.user).filter(id=service_request.id).exists():
            return Response(
                {"detail": "You cannot update this request."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not can_manage_incoming_request(request.user, service_request):
            return Response(
                {"detail": "Only the correct support/dev target entity can update request status."},
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


def get_visible_requests_queryset(user):
    base_queryset = (
        ServiceRequest.objects.select_related(
            "target_unit", "requester_user", "requester_unit", "current_assignee"
        )
        .prefetch_related("messages__sender", "status_history__changed_by")
        .order_by("-created_at")
    )

    if not user.company_id or not user.entity_id:
        return ServiceRequest.objects.none()

    if user.entity.entity_type == Entity.EntityType.PROD:
        return base_queryset.filter(requester_user_id=user.id)

    return base_queryset.filter(
        requester_user__company_id=user.company_id,
        target_unit__code=user.entity.code,
    )


def can_manage_incoming_request(user, service_request):
    if not user.entity_id or user.entity.entity_type == Entity.EntityType.PROD:
        return False
    return (
        service_request.requester_user.company_id == user.company_id
        and service_request.target_unit.code == user.entity.code
    )
