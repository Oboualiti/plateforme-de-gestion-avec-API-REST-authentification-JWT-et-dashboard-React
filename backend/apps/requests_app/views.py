from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.pagination import PageNumberPagination
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
    RequestTeamReassignmentHistory,
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
    RequestTargetReassignSerializer,
    RequestCreateSerializer,
    ServiceRequestSerializer,
    UnitMembershipSerializer,
)
from .telegram import mirror_request_message_to_telegram


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


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
        queryset = get_visible_requests_queryset(request.user)
        queryset = apply_request_filters(queryset, request.query_params)

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(queryset, request)
        if page is not None:
            mark_requests_stuck(page)
            serializer = RequestSummarySerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        requests_list = list(queryset)
        mark_requests_stuck(requests_list)
        return Response(RequestSummarySerializer(requests_list, many=True).data)

    def post(self, request):
        if not request.user.company_id or not request.user.entity_id:
            return Response(
                {"detail": "You must belong to a company and source entity to create requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        role_keys = set(get_user_role_keys(request.user))
        can_send_from_non_prod = bool({"super_admin", "senior"} & role_keys) or request.user.is_staff
        if request.user.entity.entity_type != Entity.EntityType.PROD and not can_send_from_non_prod:
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

        requester_unit = get_or_create_unit_for_entity(request.user.entity)
        target_unit = get_or_create_unit_for_entity(target_entity)

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
        mark_request_stuck(service_request)
        return Response(
            RequestDetailSerializer(
                service_request,
                context=build_request_detail_context(request, service_request),
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
        request_message = RequestMessage.objects.create(
            request=service_request,
            sender=request.user,
            message=serializer.validated_data["message"],
        )
        mirror_request_message_to_telegram(service_request, request_message)
        service_request = load_request(request_id)
        mark_request_stuck(service_request)
        return Response(
            RequestDetailSerializer(
                service_request,
                context=build_request_detail_context(request, service_request),
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
        if not can_update_request_status(request.user, service_request):
            return Response(
                {"detail": "You do not have permission to update request status."},
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
        mark_request_stuck(service_request)
        return Response(
            RequestDetailSerializer(
                service_request,
                context=build_request_detail_context(request, service_request),
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
        if not can_update_request_status(request.user, service_request):
            return Response(
                {"detail": "You do not have permission to assign this request."},
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
        mark_request_stuck(service_request)
        return Response(
            RequestDetailSerializer(
                service_request,
                context=build_request_detail_context(request, service_request),
            ).data
        )


class RequestAssignUserView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        service_request = load_request(request_id)
        if service_request is None:
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)

        if not get_visible_requests_queryset(request.user).filter(id=service_request.id).exists():
            return Response(
                {"detail": "You cannot access this request."}, status=status.HTTP_403_FORBIDDEN
            )

        if not can_update_request_status(request.user, service_request):
            return Response(
                {"detail": "You do not have permission to assign this request."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RequestAssignUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_id = serializer.validated_data["user_id"]
        note = serializer.validated_data.get("note", "Assigned via delegation")

        assignee = User.objects.filter(id=user_id, is_active=True).first()
        if not assignee:
            return Response({"detail": "User not found."}, status=status.HTTP_400_BAD_REQUEST)

        service_request.current_assignee = assignee
        service_request.save(update_fields=["current_assignee"])

        RequestAssignmentHistory.objects.create(
            request=service_request,
            assigned_by=request.user,
            assignee=assignee,
            note=note,
        )

        service_request = load_request(request_id)
        mark_request_stuck(service_request)
        return Response(
            RequestDetailSerializer(
                service_request,
                context=build_request_detail_context(request, service_request),
            ).data
        )


class RequestTargetReassignView(APIView):
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
        if not can_reassign_target_team(request.user, service_request):
            return Response(
                {"detail": "Only admin users and seniors can reassign target teams."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RequestTargetReassignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_target_entity = Entity.objects.filter(
            id=serializer.validated_data["target_team"],
            is_active=True,
        ).exclude(entity_type=Entity.EntityType.PROD).first()
        if new_target_entity is None:
            return Response(
                {"detail": "Target team not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request_company_id = get_request_company_id(service_request)
        if request_company_id and new_target_entity.company_id != request_company_id:
            return Response(
                {"detail": "Target team must belong to the same request company."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if is_company_scoped_manager(request.user) and new_target_entity.company_id != request.user.company_id:
            return Response(
                {"detail": "Seniors can only reassign requests inside their company."},
                status=status.HTTP_403_FORBIDDEN,
            )

        old_target_entity = (
            service_request.target_entity
            or Entity.objects.filter(code=service_request.target_unit.code).first()
        )
        if old_target_entity and old_target_entity.id == new_target_entity.id:
            return Response(
                {"detail": "Request is already assigned to this target team."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_unit = get_or_create_unit_for_entity(new_target_entity)
        service_request.target_entity = new_target_entity
        service_request.target_unit = target_unit
        service_request.current_assignee = None
        service_request.save(update_fields=["target_entity", "target_unit", "current_assignee"])
        RequestTeamReassignmentHistory.objects.create(
            request=service_request,
            old_target_entity=old_target_entity or new_target_entity,
            new_target_entity=new_target_entity,
            changed_by=request.user,
            note=serializer.validated_data.get("note", ""),
        )
        service_request = load_request(request_id)
        mark_request_stuck(service_request)
        return Response(
            RequestDetailSerializer(
                service_request,
                context=build_request_detail_context(request, service_request),
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
            "team_reassignment_history__old_target_entity",
            "team_reassignment_history__new_target_entity",
            "team_reassignment_history__changed_by",
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
            "team_reassignment_history__old_target_entity",
            "team_reassignment_history__new_target_entity",
            "team_reassignment_history__changed_by",
        )
        .order_by("-created_at")
    )

    if is_global_requests_manager(user):
        return base_queryset
    if is_company_scoped_manager(user):
        return base_queryset.filter(
            Q(company_id=user.company_id)
            | Q(company__isnull=True, requester_user__company_id=user.company_id)
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


def is_global_requests_manager(user):
    role_keys = set(get_user_role_keys(user))
    return "super_admin" in role_keys or user.is_staff


def is_company_scoped_manager(user):
    role_keys = set(get_user_role_keys(user))
    return "senior" in role_keys and bool(user.company_id)


def can_update_request_status(user, service_request):
    if is_global_requests_manager(user):
        return True
    if is_company_scoped_manager(user):
        return get_request_company_id(service_request) == user.company_id
    return can_manage_incoming_request(user, service_request)


def can_reassign_target_team(user, service_request):
    if is_global_requests_manager(user):
        return True
    if is_company_scoped_manager(user):
        return get_request_company_id(service_request) == user.company_id
    return False


def build_request_detail_context(request, service_request):
    return {
        "request": request,
        "can_manage_incoming_request": can_update_request_status(request.user, service_request),
        "can_reassign_target_team": can_reassign_target_team(request.user, service_request),
        "available_reassignment_targets": get_available_reassignment_targets(
            request.user, service_request
        ),
        "potential_assignees": get_potential_assignees(request.user, service_request),
    }


def get_potential_assignees(user, service_request):
    target_entity_id = get_request_target_entity_id(service_request)
    if not target_entity_id:
        return []

    # Get users in target entity
    queryset = User.objects.filter(entity_id=target_entity_id, is_active=True).order_by(
        "username"
    )
    return [{"id": u.id, "username": u.username} for u in queryset]


def get_available_reassignment_targets(user, service_request):
    request_company_id = get_request_company_id(service_request)
    if request_company_id is None:
        return []

    queryset = Entity.objects.filter(
        company_id=request_company_id,
        is_active=True,
    ).exclude(entity_type=Entity.EntityType.PROD).order_by("name")
    return [
        {
            "id": entity.id,
            "name": entity.name,
            "code": entity.code,
            "entity_type": entity.entity_type,
            "label": f"{entity.name} ({entity.get_entity_type_display()})",
        }
        for entity in queryset
    ]


def apply_request_filters(queryset, params):
    search = (params.get("search") or "").strip()
    if search:
        queryset = queryset.filter(
            Q(request_number__icontains=search)
            | Q(title__icontains=search)
            | Q(description__icontains=search)
            | Q(category__icontains=search)
            | Q(requester_user__username__icontains=search)
        )

    company = (params.get("company") or "").strip()
    company_id = params.get("company_id")
    if company_id:
        queryset = queryset.filter(Q(company_id=company_id) | Q(requester_user__company_id=company_id))
    elif company:
        queryset = queryset.filter(
            Q(company__name__icontains=company)
            | Q(company__code__icontains=company)
            | Q(requester_user__company__name__icontains=company)
            | Q(requester_user__company__code__icontains=company)
        )

    source_entity = (params.get("source_entity") or "").strip()
    source_entity_id = params.get("source_entity_id")
    if source_entity_id:
        queryset = queryset.filter(source_entity_id=source_entity_id)
    elif source_entity:
        queryset = queryset.filter(
            Q(source_entity__name__icontains=source_entity)
            | Q(source_entity__code__icontains=source_entity)
        )

    target_entity = (params.get("target_entity") or "").strip()
    target_entity_id = params.get("target_entity_id")
    if target_entity_id:
        queryset = queryset.filter(
            Q(target_entity_id=target_entity_id) | Q(target_unit__code__in=Entity.objects.filter(id=target_entity_id).values_list("code", flat=True))
        )
    elif target_entity:
        queryset = queryset.filter(
            Q(target_entity__name__icontains=target_entity)
            | Q(target_entity__code__icontains=target_entity)
            | Q(target_unit__name__icontains=target_entity)
            | Q(target_unit__code__icontains=target_entity)
        )

    request_type = (params.get("type") or "").strip()
    if request_type:
        queryset = queryset.filter(category=request_type)

    request_status = (params.get("status") or "").strip()
    if request_status:
        queryset = queryset.filter(status=request_status)

    stuck = (params.get("stuck") or "").strip().lower()
    if stuck in {"1", "true", "yes"}:
        queryset = queryset.filter(
            created_at__lte=timezone.now() - timedelta(hours=48)
        ).exclude(
            status__in=[
                ServiceRequest.Status.COMPLETED,
                ServiceRequest.Status.CLOSED,
                ServiceRequest.Status.REJECTED,
            ]
        )

    return queryset


def is_request_stuck(service_request):
    if service_request.status in {
        ServiceRequest.Status.COMPLETED,
        ServiceRequest.Status.CLOSED,
        ServiceRequest.Status.REJECTED,
    }:
        return False
    return service_request.created_at <= timezone.now() - timedelta(hours=48)


def mark_request_stuck(service_request):
    if service_request is None:
        return
    service_request.is_stuck = is_request_stuck(service_request)


def mark_requests_stuck(requests):
    for item in requests:
        mark_request_stuck(item)


def get_or_create_unit_for_entity(entity):
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
