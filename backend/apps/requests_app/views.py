from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.entities.models import Entity
from apps.permissions_app.services import get_user_role_keys

from .models import (
    MainBranch,
    OperationalUnit,
    RequestAssignmentHistory,
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

        service_request = ServiceRequest.objects.create(
            request_number=f"REQ-{timezone.now():%Y%m%d%H%M%S%f}",
            title=serializer.validated_data["title"],
            description=serializer.validated_data["description"],
            category=serializer.validated_data["type"],
            requester_user=request.user,
            company=request.user.company,
            source_entity=request.user.entity,
            target_entity=target_entity,
            requester_unit=requester_unit,
            target_unit=target_unit,
        )
        return Response(
            RequestDetailSerializer(
                load_request(service_request.id),
                context={"request": request, "can_manage_incoming_request": False},
            ).data,
            status=status.HTTP_201_CREATED,
        )


class RequestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def has_access(self, user, service_request):
        return get_visible_requests_queryset(user).filter(id=service_request.id).exists()

    def get_object(self, request_id):
        return load_request(request_id)

    def get(self, request, request_id):
        service_request = self.get_object(request_id)
        if service_request is None or not self.has_access(request.user, service_request):
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            RequestDetailSerializer(
                service_request,
                context={
                    "request": request,
                    "can_manage_incoming_request": can_manage_incoming_request(
                        request.user, service_request
                    ),
                },
            ).data
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
        service_request = load_request(request_id)
        return Response(
            RequestDetailSerializer(
                service_request,
                context={
                    "request": request,
                    "can_manage_incoming_request": can_manage_incoming_request(
                        request.user, service_request
                    ),
                },
            ).data
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
        note = serializer.validated_data.get("note", "")
        service_request.status = new_status
        update_fields = ["status"]
        if service_request.current_assignee_id is None:
            service_request.current_assignee = request.user
            update_fields.append("current_assignee")
        if new_status == ServiceRequest.Status.ACCEPTED and service_request.accepted_at is None:
            service_request.accepted_at = timezone.now()
            update_fields.append("accepted_at")
        if new_status == ServiceRequest.Status.COMPLETED:
            service_request.completed_at = timezone.now()
            service_request.resolution_note = note
            update_fields.extend(["completed_at", "resolution_note"])
        if new_status == ServiceRequest.Status.CLOSED:
            service_request.closed_at = timezone.now()
            service_request.resolution_note = note
            update_fields.extend(["closed_at", "resolution_note"])
        if new_status == ServiceRequest.Status.REJECTED:
            service_request.rejection_reason = note
            service_request.resolution_note = note
            update_fields.extend(["rejection_reason", "resolution_note"])
        service_request.save(update_fields=update_fields)
        RequestStatusHistory.objects.create(
            request=service_request,
            old_status=old_status,
            new_status=new_status,
            changed_by=request.user,
            note=note,
        )
        service_request = load_request(request_id)
        return Response(
            RequestDetailSerializer(
                service_request,
                context={"request": request, "can_manage_incoming_request": True},
            ).data
        )


class RequestAssignToMeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        service_request = load_request(request_id)
        if service_request is None:
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        if not get_visible_requests_queryset(request.user).filter(id=service_request.id).exists():
            return Response(
                {"detail": "You cannot access this request."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not can_manage_incoming_request(request.user, service_request):
            return Response(
                {"detail": "Only the correct support/dev target entity can assign this request."},
                status=status.HTTP_403_FORBIDDEN,
            )

        service_request.current_assignee = request.user
        service_request.save(update_fields=["current_assignee"])
        RequestAssignmentHistory.objects.create(
            request=service_request,
            assigned_by=request.user,
            assignee=request.user,
            note="Assigned to self",
        )
        service_request = load_request(request_id)
        return Response(
            RequestDetailSerializer(
                service_request,
                context={"request": request, "can_manage_incoming_request": True},
            ).data
        )


def load_request(request_id):
    return (
        ServiceRequest.objects.select_related(
            "company",
            "source_entity",
            "target_entity",
            "target_unit",
            "requester_unit",
            "requester_user",
            "requester_user__company",
            "current_assignee",
        )
        .prefetch_related(
            "messages__sender",
            "messages__sender__entity",
            "status_history__changed_by",
            "status_history__changed_by__entity",
            "assignment_history__assigned_by",
            "assignment_history__assigned_by__entity",
            "assignment_history__assignee",
        )
        .filter(id=request_id)
        .first()
    )


def get_visible_requests_queryset(user):
    base_queryset = (
        ServiceRequest.objects.select_related(
            "company",
            "source_entity",
            "target_entity",
            "target_unit",
            "requester_user",
            "requester_user__company",
            "requester_unit",
            "current_assignee",
        )
        .prefetch_related(
            "messages__sender",
            "messages__sender__entity",
            "status_history__changed_by",
            "status_history__changed_by__entity",
            "assignment_history__assigned_by",
            "assignment_history__assignee",
        )
        .order_by("-created_at")
    )

    if not user.company_id or not user.entity_id:
        return ServiceRequest.objects.none()

    if user.entity.entity_type == Entity.EntityType.PROD:
        return base_queryset.filter(requester_user_id=user.id)

    return base_queryset.filter(
        Q(company_id=user.company_id) | Q(company__isnull=True, requester_user__company_id=user.company_id),
        Q(target_entity_id=user.entity_id)
        | Q(target_entity__isnull=True, target_unit__code=user.entity.code),
    )


def can_manage_incoming_request(user, service_request):
    if not user.entity_id or user.entity.entity_type == Entity.EntityType.PROD:
        return False
    return (
        get_request_company_id(service_request) == user.company_id
        and get_request_target_entity_id(service_request) == user.entity_id
    )


def get_request_company_id(service_request):
    if service_request.company_id:
        return service_request.company_id
    return service_request.requester_user.company_id


def get_request_target_entity_id(service_request):
    if service_request.target_entity_id:
        return service_request.target_entity_id
    target_entity = Entity.objects.filter(code=service_request.target_unit.code).first()
    return target_entity.id if target_entity else None
