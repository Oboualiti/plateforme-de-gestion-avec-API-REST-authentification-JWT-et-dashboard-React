import json
import os
import re
import hashlib
from urllib import error as urllib_error
from urllib import request as urllib_request
from datetime import datetime, time, timedelta
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from django.db.models import Q, OuterRef, Prefetch, Subquery
from django.http import FileResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status, viewsets
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.entities.models import Entity
from apps.companies.models import Company
from apps.notifications.models import UserNotification
from apps.notifications.services import (
    create_bulk_notifications,
    create_notification,
    resolve_request_notification_recipients,
)
from apps.permissions_app.models import UserRequestPermissionOverride, UserRole
from apps.permissions_app.services import (
    apply_request_permission_override,
    can_create_requests,
    get_effective_permission_keys,
    get_primary_role_key,
    get_user_role_keys,
    has_any_permission,
    has_permission,
)
from apps.users.models import User

from .models import (
    MainBranch,
    OperationalUnit,
    RequestAssignmentHistory,
    RequestMessage,
    RequestStatusHistory,
    RequestTeamReassignmentHistory,
    ServiceRequest,
    Team,
    UnitMembership,
)
from .serializers import (
    MainBranchSerializer,
    OperationalUnitSerializer,
    RequestCommentCreateSerializer,
    RequestCommentUpdateSerializer,
    RequestDeadlineUpdateSerializer,
    RequestDetailSerializer,
    RequestMessageSerializer,
    RequestStatusUpdateSerializer,
    RequestStatusHistorySerializer,
    RequestSummarySerializer,
    REQUEST_TYPE_CHOICES,
    RequestAssignUserSerializer,
    RequestInviteMembersSerializer,
    RequestTargetReassignSerializer,
    RequestCreateSerializer,
    ServiceRequestSerializer,
    UnitMembershipSerializer,
)
from .telegram import (
    mirror_request_assignment_to_telegram,
    mirror_request_created_to_telegram,
    mirror_request_message_edited_to_telegram,
    mirror_request_message_to_telegram,
    pin_request_message_in_telegram,
    unpin_request_message_in_telegram,
)


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class OpenRouterMixin:
    def _read_env_value(self, key):
        candidate_files = [Path(settings.BASE_DIR) / ".env", Path(settings.BASE_DIR) / "env"]
        for env_file in candidate_files:
            if not env_file.exists():
                continue
            try:
                for raw_line in env_file.read_text(encoding="utf-8").splitlines():
                    line = raw_line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    env_key, value = line.split("=", 1)
                    if env_key.strip() == key:
                        parsed = value.strip().strip('"').strip("'")
                        if parsed:
                            return parsed
            except OSError:
                continue
        return os.getenv(key, "").strip()

    def _get_openrouter_api_key(self):
        api_key = self._read_env_value("OPENROUTER_API_KEY")
        is_placeholder_key = api_key.startswith("<") and api_key.endswith(">")
        if not api_key or is_placeholder_key:
            raise ValueError(
                "OpenRouter API key is not configured on the server. "
                "Set OPENROUTER_API_KEY in backend/.env to your real key (starts with sk-or-v1-)."
            )
        return api_key

    def _get_openrouter_fallback_models(self):
        raw = self._read_env_value("OPENROUTER_FALLBACK_MODELS")
        if not raw:
            return []
        models = []
        for item in raw.split(","):
            model = (item or "").strip()
            if model:
                models.append(model)
        return models

    def _extract_json_object(self, raw_text):
        stripped = (raw_text or "").strip()
        if not stripped:
            return {}
        try:
            return json.loads(stripped)
        except (TypeError, ValueError):
            pass
        match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", stripped, re.DOTALL)
        if not match:
            return {}
        try:
            return json.loads(match.group(1))
        except (TypeError, ValueError):
            return {}

    def _openrouter_chat(self, messages, model_name=None, max_tokens=700):
        api_key = self._get_openrouter_api_key()
        configured_model = (
            model_name
            or self._read_env_value("OPENROUTER_MODEL")
            or "nvidia/nemotron-3-super-120b-a12b:free"
        )
        candidate_models = [
            configured_model,
            *self._get_openrouter_fallback_models(),
            "meta-llama/llama-3.3-70b-instruct:free",
            "poolside/laguna-xs.2:free",
            
        ]
        # Keep model order, remove duplicates.
        candidate_models = list(dict.fromkeys(candidate_models))
        endpoint = "https://openrouter.ai/api/v1/chat/completions"
        last_error = "OpenRouter request failed."

        for model in candidate_models:
            for _attempt in range(2):
                payload = {
                    "model": model,
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "temperature": 0.2,
                }
                request_payload = json.dumps(payload).encode("utf-8")
                http_request = urllib_request.Request(
                    endpoint,
                    data=request_payload,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {api_key}",
                    },
                    method="POST",
                )
                try:
                    with urllib_request.urlopen(http_request, timeout=20) as response:
                        raw_body = response.read().decode("utf-8")
                    data = json.loads(raw_body)
                    choices = data.get("choices") or []
                    text = ""
                    if choices:
                        text = ((choices[0].get("message") or {}).get("content") or "").strip()
                    if text:
                        return text
                    last_error = f"No response text returned from model '{model}'."
                except urllib_error.HTTPError as exc:
                    body = exc.read().decode("utf-8", errors="ignore")
                    detail = "OpenRouter request failed."
                    try:
                        parsed = json.loads(body)
                        detail = (
                            parsed.get("error", {}).get("message")
                            or parsed.get("detail")
                            or detail
                        )
                    except (TypeError, ValueError):
                        pass
                    last_error = detail
                    continue
                except (urllib_error.URLError, TimeoutError):
                    last_error = "OpenRouter service is unreachable right now."
                    continue
        raise RuntimeError(last_error)


class RequestAiImproveView(OpenRouterMixin, APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        title = (request.data.get("title") or "").strip()
        description = (request.data.get("description") or "").strip()
        if not title and not description:
            return Response(
                {"detail": "Provide at least a title or description for AI improvement."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        current_type = (request.data.get("type") or "").strip().upper()
        available_targets = request.data.get("available_targets") or []
        if not isinstance(available_targets, list):
            available_targets = []

        normalized_targets = []
        for item in available_targets:
            if not isinstance(item, dict):
                continue
            target_id = item.get("id")
            label = (item.get("label") or item.get("name") or "").strip()
            if not label:
                continue
            normalized_targets.append({"id": target_id, "label": label})

        allowed_types = [choice[0] for choice in REQUEST_TYPE_CHOICES]
        target_guidance = ", ".join(f"{entry['id']}: {entry['label']}" for entry in normalized_targets) or "No target teams provided."

        prompt = (
            "You are helping enterprise users improve internal service requests.\n"
            "Input may be in Darija, French, English, or mixed language.\n"
            "Always write all output text fields in clear professional English.\n"
            "Return ONLY valid JSON with keys:\n"
            "suggested_title (string), improved_description (string), suggested_type (one of "
            f"{allowed_types}), suggested_target_team_name (string), missing_information (array of strings), "
            "normalized_language (string).\n"
            "Keep business wording concise and clear."
        )
        user_message = (
            f"Current title: {title or '-'}\n"
            f"Current description: {description or '-'}\n"
            f"Current type: {current_type or '-'}\n"
            f"Allowed types: {', '.join(allowed_types)}\n"
            f"Available target teams: {target_guidance}\n"
            "Output language requirement: English only.\n"
            "If information is missing, list it in missing_information."
        )

        try:
            raw = self._openrouter_chat(
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": user_message},
                ],
                max_tokens=900,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        parsed = self._extract_json_object(raw)
        missing_info = parsed.get("missing_information") if isinstance(parsed, dict) else []
        if not isinstance(missing_info, list):
            missing_info = []
        missing_info = [str(item).strip() for item in missing_info if str(item).strip()]

        suggested_type = str((parsed or {}).get("suggested_type", "")).upper().strip()
        if suggested_type not in allowed_types:
            suggested_type = current_type if current_type in allowed_types else ""

        suggested_target_name = str((parsed or {}).get("suggested_target_team_name", "")).strip()
        suggested_target_id = None
        if suggested_target_name:
            lowered_suggestion = suggested_target_name.lower()
            for target in normalized_targets:
                lowered_label = target["label"].lower()
                if lowered_suggestion == lowered_label or lowered_suggestion in lowered_label or lowered_label in lowered_suggestion:
                    suggested_target_id = target["id"]
                    suggested_target_name = target["label"]
                    break

        return Response(
            {
                "suggested_title": str((parsed or {}).get("suggested_title", "")).strip(),
                "improved_description": str((parsed or {}).get("improved_description", "")).strip(),
                "suggested_type": suggested_type,
                "suggested_target_team_id": suggested_target_id,
                "suggested_target_team_name": suggested_target_name,
                "missing_information": missing_info,
                "normalized_language": str((parsed or {}).get("normalized_language", "")).strip(),
                "raw_response": raw if not parsed else "",
            }
        )


class RequestAiSummaryView(OpenRouterMixin, APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        service_request = load_request(request_id)
        if service_request is None or not get_visible_requests_queryset(request.user).filter(id=request_id).exists():
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        can_view_discussion = can_use_request_permission(
            request.user,
            service_request,
            "request.view_discussion",
            has_permission(request.user, "view_request_discussion"),
        )
        if not can_view_discussion:
            return Response(
                {"detail": "You do not have permission to view request discussion."},
                status=status.HTTP_403_FORBIDDEN,
            )

        comments = list(service_request.messages.all().order_by("created_at"))
        status_events = list(service_request.status_history.all().order_by("changed_at"))
        assignment_events = list(service_request.assignment_history.all().order_by("created_at"))

        comment_lines = [
            f"- [{item.created_at.isoformat()}] {item.sender.username}: {item.message}"
            for item in comments[-40:]
        ]
        status_lines = [
            f"- [{item.changed_at.isoformat()}] {item.changed_by.username}: {item.old_status} -> {item.new_status}. Note: {item.note or '-'}"
            for item in status_events[-20:]
        ]
        assignment_lines = [
            f"- [{item.created_at.isoformat()}] {item.assigned_by.username} assigned to {item.assignee.username}. Note: {item.note or '-'}"
            for item in assignment_events[-20:]
        ]

        prompt = (
            "You summarize enterprise support request discussions.\n"
            "Always write all output fields in clear professional English.\n"
            "Return ONLY valid JSON with keys:\n"
            "short_summary (string), current_progress (string), latest_blocker (string), "
            "already_done (array of strings), still_needed (array of strings), "
            "pending_from (one of requester, handler, both, unknown), next_action (string).\n"
            "Be concise, factual, and avoid speculation."
        )
        user_message = (
            f"Request title: {service_request.title}\n"
            f"Request description: {service_request.description}\n"
            f"Current status: {service_request.status}\n"
            f"Current assignee: {service_request.current_assignee.username if service_request.current_assignee_id else 'Unassigned'}\n"
            f"Resolution note: {service_request.resolution_note or '-'}\n"
            "Status history:\n"
            f"{chr(10).join(status_lines) or '- none -'}\n"
            "Assignments:\n"
            f"{chr(10).join(assignment_lines) or '- none -'}\n"
            "Discussion comments:\n"
            f"{chr(10).join(comment_lines) or '- none -'}"
        )

        try:
            raw = self._openrouter_chat(
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": user_message},
                ],
                max_tokens=900,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        parsed = self._extract_json_object(raw)
        if not isinstance(parsed, dict):
            parsed = {}

        def clean_list(key):
            value = parsed.get(key) if isinstance(parsed.get(key), list) else []
            return [str(item).strip() for item in value if str(item).strip()]

        pending_from = str(parsed.get("pending_from", "unknown")).strip().lower()
        if pending_from not in {"requester", "handler", "both", "unknown"}:
            pending_from = "unknown"

        return Response(
            {
                "short_summary": str(parsed.get("short_summary", "")).strip(),
                "current_progress": str(parsed.get("current_progress", "")).strip(),
                "latest_blocker": str(parsed.get("latest_blocker", "")).strip(),
                "already_done": clean_list("already_done"),
                "still_needed": clean_list("still_needed"),
                "pending_from": pending_from,
                "next_action": str(parsed.get("next_action", "")).strip(),
                "raw_response": raw if not parsed else "",
            }
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


class CreditsSolvesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        credits_status_filter = (
            Q(status__in=[ServiceRequest.Status.COMPLETED, ServiceRequest.Status.CLOSED])
            | Q(
                status=ServiceRequest.Status.IN_PROGRESS,
                status_history__old_status=ServiceRequest.Status.COMPLETED,
                status_history__new_status=ServiceRequest.Status.IN_PROGRESS,
            )
        )
        user_entity_type = (getattr(getattr(request.user, "entity", None), "entity_type", "") or "").upper()
        effective_user_company_id = (
            request.user.company_id
            or getattr(getattr(request.user, "entity", None), "company_id", None)
        )
        is_prod_entity_user = user_entity_type == Entity.EntityType.PROD
        role_key = get_primary_role_key(request.user)
        is_prod_requester_scope = is_prod_entity_user and role_key in {"manager", "team_leader", "user"}
        is_prod_team_scope = is_prod_entity_user and role_key in {"manager", "team_leader"}
        is_prod_reviewer = (
            is_prod_entity_user
            and role_key in {"manager", "team_leader"}
            and has_permission(request.user, "approve_request")
        )

        if is_prod_requester_scope:
            solves_qs = ServiceRequest.objects.filter(
                credits_status_filter,
            )
            if effective_user_company_id:
                solves_qs = solves_qs.filter(company_id=effective_user_company_id)
            if request.user.entity_id:
                solves_qs = solves_qs.filter(source_entity_id=request.user.entity_id)
        elif role_key == "user" and not is_prod_entity_user:
            solves_qs = ServiceRequest.objects.filter(
                credits_status_filter,
            )
            if effective_user_company_id:
                solves_qs = solves_qs.filter(company_id=effective_user_company_id)
            if request.user.entity_id:
                solves_qs = solves_qs.filter(target_entity_id=request.user.entity_id)
        else:
            visible_qs = get_visible_requests_queryset(request.user, include_related=True)
            solves_qs = visible_qs.filter(credits_status_filter)
        solves_qs = solves_qs.distinct()

        completed_by_subquery = RequestStatusHistory.objects.filter(
            request_id=OuterRef("pk"),
            new_status=ServiceRequest.Status.COMPLETED,
        ).order_by("-changed_at")
        closed_by_subquery = RequestStatusHistory.objects.filter(
            request_id=OuterRef("pk"),
            new_status=ServiceRequest.Status.CLOSED,
        ).order_by("-changed_at")

        solves_qs = solves_qs.annotate(
            completed_by_id=Subquery(completed_by_subquery.values("changed_by_id")[:1]),
            closed_by_id=Subquery(closed_by_subquery.values("changed_by_id")[:1]),
        )

        company_id = request.query_params.get("company_id")
        target_entity_id = request.query_params.get("target_entity_id") or request.query_params.get("entity_id")
        target_team_id = request.query_params.get("target_team_id")
        solver_user_id = request.query_params.get("solver_user_id") or request.query_params.get("user_id")
        source_entity_id = request.query_params.get("source_entity_id")
        source_team_id = request.query_params.get("source_team_id")
        requester_user_id = request.query_params.get("requester_user_id")
        include_requester_rankings = str(request.query_params.get("include_requester_rankings", "1")).strip().lower() not in {"0", "false", "no"}
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        priority = (request.query_params.get("priority") or "").strip().upper()
        request_type = (request.query_params.get("request_type") or "").strip().upper()
        support_user_team_leader_ids = set()
        support_user_team_member_ids = set()
        support_user_target_team_ids = set()

        if role_key == "user" and not is_prod_entity_user:
            if request.user.team_leader_id:
                support_user_team_leader_ids.add(request.user.team_leader_id)
            support_user_team_leader_ids.update(
                Team.objects.filter(is_active=True, members__id=request.user.id).values_list("leader_id", flat=True)
            )
            support_user_team_leader_ids.discard(None)
            if support_user_team_leader_ids:
                support_user_team_member_ids.update(
                    User.objects.filter(team_leader_id__in=support_user_team_leader_ids).values_list("id", flat=True)
                )
                support_user_team_member_ids.update(
                    Team.objects.filter(is_active=True, leader_id__in=support_user_team_leader_ids).values_list("members__id", flat=True)
                )
                support_user_target_team_ids.update(
                    Team.objects.filter(is_active=True, leader_id__in=support_user_team_leader_ids).values_list("id", flat=True)
                )
                team_leader_member_ids = set(
                    UserRole.objects.filter(
                        role__key="team_leader",
                        user_id__in=support_user_team_member_ids,
                    ).values_list("user_id", flat=True)
                )
                support_user_team_member_ids.difference_update(team_leader_member_ids)
            support_user_team_member_ids.add(request.user.id)
            support_user_team_member_ids.discard(None)
            support_user_target_team_ids.discard(None)

        if company_id:
            solves_qs = solves_qs.filter(company_id=company_id)
        if target_entity_id:
            solves_qs = solves_qs.filter(target_entity_id=target_entity_id)
        if target_team_id:
            solves_qs = solves_qs.filter(
                Q(target_team_id=target_team_id)
                | Q(target_team__leader_id=target_team_id)
                | Q(target_team_leader_id=target_team_id)
            )
        if solver_user_id:
            solves_qs = solves_qs.filter(current_assignee_id=solver_user_id)
        if source_entity_id:
            solves_qs = solves_qs.filter(source_entity_id=source_entity_id)
        if source_team_id:
            solves_qs = solves_qs.filter(
                Q(requester_user__team_leader_id=source_team_id)
                | Q(requester_user_id=source_team_id)
            )
        if requester_user_id:
            solves_qs = solves_qs.filter(requester_user_id=requester_user_id)
        if date_from:
            from_day = parse_date(date_from)
            if from_day:
                from_dt = timezone.make_aware(
                    datetime.combine(from_day, time.min),
                    timezone.get_current_timezone(),
                )
                solves_qs = solves_qs.filter(completed_at__gte=from_dt)
        if date_to:
            to_day = parse_date(date_to)
            if to_day:
                to_dt = timezone.make_aware(
                    datetime.combine(to_day + timedelta(days=1), time.min),
                    timezone.get_current_timezone(),
                )
                solves_qs = solves_qs.filter(completed_at__lt=to_dt)
        if request_type:
            solves_qs = solves_qs.filter(category=request_type)
        if priority in {
            ServiceRequest.Priority.LOW,
            ServiceRequest.Priority.MEDIUM,
            ServiceRequest.Priority.HIGH,
            ServiceRequest.Priority.CRITICAL,
        }:
            solves_qs = solves_qs.filter(priority=priority)

        if not is_prod_entity_user and not is_prod_team_scope:
            if role_key in {"senior", "manager" } and effective_user_company_id:
                solves_qs = solves_qs.filter(company_id=effective_user_company_id)
            elif role_key == "team_leader" and request.user.entity_id:
                solves_qs = solves_qs.filter(target_entity_id=request.user.entity_id)
            elif role_key == "user":
                if support_user_team_member_ids:
                    solves_qs = solves_qs.filter(current_assignee_id__in=support_user_team_member_ids)
                else:
                    solves_qs = solves_qs.filter(current_assignee_id=request.user.id)

        solves_qs = solves_qs.select_related(
            "company",
            "source_entity",
            "source_entity__company",
            "target_entity",
            "target_team_leader",
            "target_team",
            "target_team__leader",
            "target_team__entity",
            "requester_user",
            "requester_user__team_leader",
            "requester_user__entity",
            "requester_user__entity__company",
            "current_assignee",
        ).prefetch_related(
            Prefetch(
                "messages",
                queryset=RequestMessage.objects.only(
                    "id",
                    "request_id",
                    "sender_id",
                    "message",
                    "attachment",
                    "created_at",
                ).order_by("created_at"),
                to_attr="prefetched_messages",
            )
        ).order_by("-completed_at", "-closed_at", "-id")
        solves_list = list(solves_qs)
        entity_leaders_from_requests = {}
        for req in solves_list:
            entity_id = req.target_entity_id
            if not entity_id:
                continue
            leader_id = (
                req.target_team.leader_id
                if req.target_team_id and req.target_team and req.target_team.leader_id
                else req.target_team_leader_id
            )
            if not leader_id:
                continue
            leader_name = (
                (req.target_team.leader.get_full_name() or req.target_team.leader.username)
                if req.target_team_id and req.target_team and req.target_team.leader_id
                else ((req.target_team_leader.get_full_name() or req.target_team_leader.username) if req.target_team_leader_id else "")
            )
            bucket = entity_leaders_from_requests.setdefault(entity_id, {})
            if leader_id not in bucket:
                bucket[leader_id] = (leader_name or "").strip()

        solver_ids = set()
        target_entity_ids = set()
        for req in solves_list:
            solver_id = req.current_assignee_id or req.completed_by_id or req.closed_by_id
            if solver_id:
                solver_ids.add(solver_id)
            if req.target_entity_id:
                target_entity_ids.add(req.target_entity_id)

        solver_team_leader_map = {}
        if solver_ids:
            solver_ids_with_tl_role = set(
                UserRole.objects.filter(role__key="team_leader", user_id__in=solver_ids).values_list("user_id", flat=True)
            )
            for solver in User.objects.select_related("team_leader").filter(id__in=solver_ids).only(
                "id",
                "entity_id",
                "username",
                "first_name",
                "last_name",
                "team_leader_id",
                "team_leader__id",
                "team_leader__username",
                "team_leader__first_name",
                "team_leader__last_name",
                "team_leader__entity_id",
            ):
                leader = solver.team_leader
                if leader:
                    solver_team_leader_map[solver.id] = {
                        "id": leader.id,
                        "name": (leader.get_full_name() or leader.username or "").strip(),
                        "entity_id": leader.entity_id,
                    }
                    continue
                if solver.id in solver_ids_with_tl_role:
                    solver_team_leader_map[solver.id] = {
                        "id": solver.id,
                        "name": (solver.get_full_name() or solver.username or "").strip(),
                        "entity_id": solver.entity_id,
                    }

        unique_entity_leader_map = {}
        if target_entity_ids:
            entity_to_leaders = {}
            for team in Team.objects.select_related("leader").filter(
                is_active=True,
                entity_id__in=target_entity_ids,
                leader__isnull=False,
                leader__is_active=True,
            ).only(
                "entity_id",
                "leader_id",
                "leader__id",
                "leader__username",
                "leader__first_name",
                "leader__last_name",
            ):
                if not team.entity_id or not team.leader_id:
                    continue
                bucket = entity_to_leaders.setdefault(team.entity_id, {})
                if team.leader_id not in bucket:
                    bucket[team.leader_id] = {
                        "id": team.leader_id,
                        "name": (team.leader.get_full_name() or team.leader.username or "").strip(),
                    }
            role_leader_rows = (
                UserRole.objects.select_related("user")
                .filter(
                    role__key="team_leader",
                    user__is_active=True,
                    user__entity_id__in=target_entity_ids,
                )
                .only(
                    "user_id",
                    "user__id",
                    "user__username",
                    "user__first_name",
                    "user__last_name",
                    "user__entity_id",
                )
            )
            for link in role_leader_rows:
                leader = link.user
                if not leader or not leader.entity_id:
                    continue
                bucket = entity_to_leaders.setdefault(leader.entity_id, {})
                if leader.id not in bucket:
                    bucket[leader.id] = {
                        "id": leader.id,
                        "name": (leader.get_full_name() or leader.username or "").strip(),
                    }
            for entity_id, leaders_by_id in entity_to_leaders.items():
                if len(leaders_by_id) == 1:
                    unique_entity_leader_map[entity_id] = next(iter(leaders_by_id.values()))

        base_credits_by_type = {
            "INFO": 10,
            "SCRIPT": 25,
            "TOOL": 40,
            "APP_PROJECT": 60,
            "OTHER": 15,
        }

        sla_hours_by_type = {
            "INFO": 24,
            "SCRIPT": 72,
            "TOOL": 120,
            "APP_PROJECT": 168,
            "OTHER": 48,
        }

        solves = []
        user_map = {}
        entity_map = {}
        for req in solves_list:
            can_validate_result = (
                req.status == ServiceRequest.Status.COMPLETED
                and can_validate_completed_result(request.user, req)
            )
            can_result_approve = can_validate_result
            can_result_reject = can_validate_result
            solver_id = req.current_assignee_id or req.completed_by_id or req.closed_by_id
            effective_team_id = req.target_team_id
            effective_team_name = (req.target_team.name or "").strip() if req.target_team_id else None
            effective_team_leader_id = (
                req.target_team.leader_id
                if req.target_team_id and req.target_team and req.target_team.leader_id
                else req.target_team_leader_id
            )
            effective_team_leader_name = (
                (req.target_team.leader.get_full_name() or req.target_team.leader.username)
                if req.target_team_id and req.target_team and req.target_team.leader_id
                else ((req.target_team_leader.get_full_name() or req.target_team_leader.username) if req.target_team_leader_id else None)
            )
            if not effective_team_leader_id:
                inferred_from_solver = solver_team_leader_map.get(solver_id)
                if inferred_from_solver and (
                    not req.target_entity_id
                    or not inferred_from_solver.get("entity_id")
                    or inferred_from_solver.get("entity_id") == req.target_entity_id
                ):
                    effective_team_leader_id = inferred_from_solver["id"]
                    effective_team_leader_name = inferred_from_solver["name"]
                elif req.target_entity_id and req.target_entity_id in unique_entity_leader_map:
                    inferred_from_entity = unique_entity_leader_map[req.target_entity_id]
                    effective_team_leader_id = inferred_from_entity["id"]
                    effective_team_leader_name = inferred_from_entity["name"]
                elif req.target_entity_id and req.target_entity_id in entity_leaders_from_requests:
                    inferred_by_requests = entity_leaders_from_requests[req.target_entity_id]
                    if len(inferred_by_requests) == 1:
                        only_leader_id = next(iter(inferred_by_requests.keys()))
                        effective_team_leader_id = only_leader_id
                        effective_team_leader_name = inferred_by_requests[only_leader_id]
                elif (
                    role_key == "team_leader"
                    and request.user.id
                    and req.target_entity_id
                    and request.user.entity_id == req.target_entity_id
                ):
                    effective_team_leader_id = request.user.id
                    effective_team_leader_name = (
                        request.user.get_full_name() or request.user.username or ""
                    ).strip()

            evidence_list = []

            for message in getattr(req, "prefetched_messages", []):
                message_text = message.message or ""
                is_credit_evidence = (
                    message_text.strip().lower().startswith("credits evidence") or
                    message_text.strip().lower().startswith("credits proof")
                )
                if not is_credit_evidence:
                    continue
                if message.sender_id != solver_id:
                    continue

                evidence_item = {
                    "id": message.id,
                    "senderId": message.sender_id,
                    "createdAt": message.created_at.isoformat() if message.created_at else None,
                    "type": None,
                    "name": None,
                    "url": None,
                }

                if message.attachment:
                    try:
                        msg_attachment_url = request.build_absolute_uri(message.attachment.url)
                    except Exception:
                        msg_attachment_url = message.attachment.url
                    if msg_attachment_url:
                        evidence_item["type"] = "file"
                        evidence_item["name"] = message.attachment.name if hasattr(message.attachment, 'name') else "attachment"
                        evidence_item["url"] = msg_attachment_url
                else:
                    found_links = re.findall(r"https?://[^\s)]+", message_text)
                    if found_links:
                        evidence_item["type"] = "link"
                        evidence_item["name"] = found_links[0]
                        evidence_item["url"] = found_links[0]

                if evidence_item["type"]:
                    evidence_list.append(evidence_item)

            has_evidence = len(evidence_list) > 0

            req_type = req.category or "OTHER"
            base_credits = base_credits_by_type.get(req_type, 15)
            sla_hours = sla_hours_by_type.get(req_type, 48)

            completed_at = req.completed_at or req.closed_at
            time_to_resolve_hours = None
            within_sla = False
            sla_bonus = 0

            if completed_at and req.created_at:
                time_to_resolve_hours = (completed_at - req.created_at).total_seconds() / 3600
                within_sla = time_to_resolve_hours <= sla_hours
                sla_bonus = 5 if within_sla else 0

            evidence_bonus = 5 if has_evidence else 0
            potential_credits = base_credits + sla_bonus + evidence_bonus
            is_earned = req.status == ServiceRequest.Status.CLOSED
            credits = potential_credits if is_earned else 0

            if req.target_entity_id and req.target_entity_id not in entity_map:
                entity_map[req.target_entity_id] = {
                    "id": req.target_entity.id,
                    "name": req.target_entity.name,
                }

            row_target_entity_id = req.target_entity_id
            target_entity_name = req.target_entity.name if req.target_entity_id else ""
            display_team_name = (
                f"{effective_team_leader_name}'s Team"
                if effective_team_leader_name
                else effective_team_name
            )
            team_key = (
                f"tl-{effective_team_leader_id}"
                if effective_team_leader_id
                else (
                    f"team-{effective_team_id}"
                    if effective_team_id
                    else f"legacy-{row_target_entity_id or 'unknown'}"
                )
            )
            target_team_label = (
                f"{display_team_name} — {target_entity_name}"
                if display_team_name
                else (
                    f"{effective_team_leader_name}'s Team — {target_entity_name}"
                    if effective_team_leader_name
                    else (f"{target_entity_name} Legacy Queue" if target_entity_name else "Legacy Queue")
                )
            )

            solves.append(
                {
                    "id": f"req-{req.id}",
                    "requestId": req.id,
                    "requestUrl": f"/requests/{req.id}",
                    "requestTitle": req.title,
                    "requestReference": req.request_number,
                    "solverId": solver_id,
                    "solverRole": "",
                    "entityId": row_target_entity_id,
                    "companyId": req.company_id,
                    "solverEntityName": target_entity_name,
                    "solverCompanyName": req.company.name if req.company_id else "",
                    "sourceCompanyName": req.company.name if req.company_id else "",
                    "sourceEntityId": req.source_entity_id,
                    "sourceEntityName": req.source_entity.name if req.source_entity_id else "",
                    "requesterName": (
                        req.requester_user.get_full_name() or req.requester_user.username
                    ) if req.requester_user_id else "",
                    "target_entity_id": row_target_entity_id,
                    "target_entity_name": target_entity_name,
                    "targetEntityId": row_target_entity_id,
                    "targetEntityName": target_entity_name,
                    "target_team_leader_id": effective_team_leader_id,
                    "target_team_leader_name": effective_team_leader_name,
                    "target_team_label": target_team_label,
                    "target_team_id": effective_team_id,
                    "target_team_name": effective_team_name,
                    "team_key": team_key,
                    "targetTeamLeaderId": effective_team_leader_id,
                    "targetTeamLeaderName": effective_team_leader_name,
                    "targetTeamLabel": target_team_label,
                    "targetTeamId": effective_team_id,
                    "targetTeamName": effective_team_name,
                    "teamKey": team_key,
                    "priority": req.priority,
                    "requestType": req_type,
                    "credits": credits,
                    "previewCredits": potential_credits,
                    "isEarned": is_earned,
                    "baseCredits": base_credits,
                    "slaBonus": sla_bonus,
                    "evidenceBonus": evidence_bonus,
                    "withinSla": within_sla,
                    "timeToResolveHours": round(time_to_resolve_hours, 1) if time_to_resolve_hours else None,
                    "slaHours": sla_hours,
                    "creditBreakdown": {
                        "base": base_credits,
                        "sla": sla_bonus,
                        "evidence": evidence_bonus,
                        "total": potential_credits,
                        "requestType": req_type,
                        "withinSla": within_sla,
                    },
                    "evidenceList": evidence_list,
                    "evidenceSummary": (
                        f"{len([e for e in evidence_list if e['type'] == 'file'])} file{'' if len([e for e in evidence_list if e['type'] == 'file']) == 1 else 's'}, "
                        f"{len([e for e in evidence_list if e['type'] == 'link'])} link{'' if len([e for e in evidence_list if e['type'] == 'link']) == 1 else 's'}"
                        if evidence_list
                        else "-"
                    ),
                    "hasEvidence": has_evidence,
                    "evidenceType": evidence_list[0]["type"] if evidence_list else None,
                    "evidenceName": evidence_list[0]["name"] if evidence_list else "",
                    "evidenceUrl": evidence_list[0]["url"] if evidence_list else "",
                    "note": req.resolution_note or "",
                    "completionNote": req.resolution_note or "",
                    "statusHistory": [],
                    "status": "solved",
                    "requestStatus": req.status,
                    "wasRejected": bool(req.rejection_reason),
                    "rejectionReason": req.rejection_reason or "",
                    "rejectionNote": req.resolution_note or "",
                    "canResultApprove": can_result_approve,
                    "canResultReject": can_result_reject,
                    "completedAt": (
                        req.completed_at.isoformat()
                        if req.completed_at
                        else (req.closed_at.isoformat() if req.closed_at else req.created_at.isoformat())
                    ),
                    "closedAt": req.closed_at.isoformat() if req.closed_at else None,
                }
            )

        solver_ids = {item["solverId"] for item in solves if item.get("solverId")}
        if solver_ids:
            for solver in User.objects.filter(id__in=solver_ids).only(
                "id", "first_name", "last_name", "username"
            ):
                user_map[solver.id] = {
                    "id": solver.id,
                    "full_name": solver.get_full_name() or solver.username,
                }

        def _sort_rankings(items):
            def _avg_key(row):
                avg = row.get("avgHours")
                return avg if isinstance(avg, (int, float)) and avg > 0 else float("inf")

            return sorted(
                items,
                key=lambda row: (
                    -int(row.get("totalCredits", 0) or 0),
                    -int(row.get("closedCount", 0) or 0),
                    _avg_key(row),
                    str(
                        row.get("name")
                        or row.get("teamLabel")
                        or row.get("entityName")
                        or row.get("full_name")
                        or ""
                    ).lower(),
                ),
            )

        entity_stats = {}
        team_stats = {}
        people_stats = {}

        for row in solves:
            row_status = str(row.get("requestStatus") or "").upper()
            is_closed = row_status == ServiceRequest.Status.CLOSED
            is_pending = row_status == ServiceRequest.Status.COMPLETED
            row_credits = int(row.get("credits") or 0) if is_closed else 0
            row_hours = row.get("timeToResolveHours")
            has_evidence = bool(row.get("hasEvidence"))

            entity_id = row.get("target_entity_id") or row.get("entityId") or "unknown"
            entity_name = row.get("target_entity_name") or row.get("targetEntityName") or "Unknown"
            solver_id = row.get("solverId")
            team_id = row.get("target_team_id") or row.get("targetTeamId")
            team_name = row.get("target_team_name") or row.get("targetTeamName")
            team_leader_id = row.get("target_team_leader_id") or row.get("targetTeamLeaderId")
            team_leader_name = row.get("target_team_leader_name") or row.get("targetTeamLeaderName")
            team_label = row.get("target_team_label") or row.get("targetTeamLabel") or (
                f"{team_leader_name}'s Team - {entity_name}"
                if team_leader_name and entity_name
                else (entity_name or "Unknown Team")
            )
            team_key = (
                row.get("team_key")
                or row.get("teamKey")
                or (
                    f"team-{team_id}"
                    if team_id
                    else (f"tl-{team_leader_id}" if team_leader_id else f"legacy-{entity_id}")
                )
            )

            ent = entity_stats.setdefault(
                str(entity_id),
                {
                    "entityId": entity_id,
                    "name": entity_name,
                    "totalCredits": 0,
                    "closedCount": 0,
                    "pendingCount": 0,
                    "withEvidenceCount": 0,
                    "hoursTotal": 0.0,
                    "hoursCount": 0,
                    "teamKeys": set(),
                    "solverIds": set(),
                },
            )
            ent["teamKeys"].add(team_key)
            if solver_id:
                ent["solverIds"].add(str(solver_id))
            if is_closed:
                ent["totalCredits"] += row_credits
                ent["closedCount"] += 1
                if has_evidence:
                    ent["withEvidenceCount"] += 1
                if isinstance(row_hours, (int, float)) and row_hours > 0:
                    ent["hoursTotal"] += float(row_hours)
                    ent["hoursCount"] += 1
            elif is_pending:
                ent["pendingCount"] += 1

            team = team_stats.setdefault(
                team_key,
                {
                    "teamKey": team_key,
                    "teamId": team_id,
                    "teamName": team_name,
                    "teamLeaderId": team_leader_id,
                    "teamLeaderName": team_leader_name,
                    "teamLabel": team_label,
                    "entityId": entity_id,
                    "entityName": entity_name,
                    "totalCredits": 0,
                    "closedCount": 0,
                    "pendingCount": 0,
                    "withEvidenceCount": 0,
                    "hoursTotal": 0.0,
                    "hoursCount": 0,
                    "solverIds": set(),
                },
            )
            if solver_id:
                team["solverIds"].add(str(solver_id))
            if is_closed:
                team["totalCredits"] += row_credits
                team["closedCount"] += 1
                if has_evidence:
                    team["withEvidenceCount"] += 1
                if isinstance(row_hours, (int, float)) and row_hours > 0:
                    team["hoursTotal"] += float(row_hours)
                    team["hoursCount"] += 1
            elif is_pending:
                team["pendingCount"] += 1

            person_key = str(solver_id or "unknown")
            person_name = user_map.get(solver_id, {}).get("full_name") or row.get("solverName") or "Unknown"
            person = people_stats.setdefault(
                person_key,
                {
                    "userId": solver_id,
                    "name": person_name,
                    "teamId": team_id,
                    "teamName": team_name,
                    "teamLabel": team_label,
                    "entityId": entity_id,
                    "entityName": entity_name,
                    "totalCredits": 0,
                    "closedCount": 0,
                    "pendingCount": 0,
                    "evidenceAdded": 0,
                    "hoursTotal": 0.0,
                    "hoursCount": 0,
                    "latestTeamContextAt": None,
                },
            )
            row_context_at = row.get("closedAt") or row.get("completedAt")
            if row_context_at and (person["latestTeamContextAt"] is None or row_context_at >= person["latestTeamContextAt"]):
                person["teamId"] = team_id
                person["teamName"] = team_name
                person["teamLabel"] = team_label
                person["entityId"] = entity_id
                person["entityName"] = entity_name
                person["latestTeamContextAt"] = row_context_at
            if is_closed:
                person["totalCredits"] += row_credits
                person["closedCount"] += 1
                if has_evidence:
                    person["evidenceAdded"] += 1
                if isinstance(row_hours, (int, float)) and row_hours > 0:
                    person["hoursTotal"] += float(row_hours)
                    person["hoursCount"] += 1
            elif is_pending:
                person["pendingCount"] += 1

        # Merge legacy team buckets into TL-owned bucket when the entity has exactly one TL team in current dataset.
        entity_tl_team_keys = {}
        for key, item in team_stats.items():
            entity_id = item.get("entityId")
            if not entity_id or not item.get("teamLeaderId"):
                continue
            entity_tl_team_keys.setdefault(str(entity_id), set()).add(key)

        legacy_keys = [
            key for key, item in team_stats.items()
            if not item.get("teamLeaderId") and str(item.get("entityId") or "") in entity_tl_team_keys
        ]
        for legacy_key in legacy_keys:
            legacy_item = team_stats.get(legacy_key)
            if not legacy_item:
                continue
            entity_key = str(legacy_item.get("entityId") or "")
            tl_keys = entity_tl_team_keys.get(entity_key) or set()
            if len(tl_keys) != 1:
                continue
            target_key = next(iter(tl_keys))
            target_item = team_stats.get(target_key)
            if not target_item:
                continue
            target_item["totalCredits"] += legacy_item.get("totalCredits", 0)
            target_item["closedCount"] += legacy_item.get("closedCount", 0)
            target_item["pendingCount"] += legacy_item.get("pendingCount", 0)
            target_item["withEvidenceCount"] += legacy_item.get("withEvidenceCount", 0)
            target_item["hoursTotal"] += legacy_item.get("hoursTotal", 0.0)
            target_item["hoursCount"] += legacy_item.get("hoursCount", 0)
            target_item["solverIds"].update(legacy_item.get("solverIds", set()))
            team_stats.pop(legacy_key, None)

        entity_rankings = []
        for item in entity_stats.values():
            avg_hours = item["hoursTotal"] / item["hoursCount"] if item["hoursCount"] else 0
            closed_count = item["closedCount"]
            if int(closed_count or 0) <= 0:
                continue
            entity_rankings.append(
                {
                    "entityId": item["entityId"],
                    "name": item["name"],
                    "totalCredits": item["totalCredits"],
                    "closedCount": closed_count,
                    "pendingCount": item["pendingCount"],
                    "teamsCount": len(item["teamKeys"]),
                    "activeSolvers": len(item["solverIds"]),
                    "coverage": int(round((item["withEvidenceCount"] / closed_count) * 100)) if closed_count else 0,
                    "avgHours": avg_hours,
                }
            )

        team_rankings = []
        for item in team_stats.values():
            avg_hours = item["hoursTotal"] / item["hoursCount"] if item["hoursCount"] else 0
            closed_count = item["closedCount"]
            if int(closed_count or 0) <= 0:
                continue
            team_rankings.append(
                {
                    "teamKey": item["teamKey"],
                    "teamId": item.get("teamId"),
                    "teamName": item.get("teamName"),
                    "teamLeaderId": item["teamLeaderId"],
                    "teamLeaderName": item["teamLeaderName"],
                    "teamLabel": item["teamLabel"],
                    "name": item["teamLabel"],
                    "entityId": item["entityId"],
                    "entityName": item["entityName"],
                    "totalCredits": item["totalCredits"],
                    "closedCount": closed_count,
                    "pendingCount": item["pendingCount"],
                    "activeSolvers": len(item["solverIds"]),
                    "membersCount": len(item["solverIds"]),
                    "coverage": int(round((item["withEvidenceCount"] / closed_count) * 100)) if closed_count else 0,
                    "avgHours": avg_hours,
                }
            )

        people_rankings = []
        for item in people_stats.values():
            if int(item.get("closedCount", 0) or 0) <= 0:
                continue
            avg_hours = item["hoursTotal"] / item["hoursCount"] if item["hoursCount"] else 0
            team_label = item["teamLabel"]
            if (not item.get("teamId")) and item.get("entityId"):
                tl_keys = entity_tl_team_keys.get(str(item.get("entityId"))) or set()
                if len(tl_keys) == 1:
                    tl_item = team_stats.get(next(iter(tl_keys)))
                    if tl_item and tl_item.get("teamLabel"):
                        team_label = tl_item["teamLabel"]
            people_rankings.append(
                {
                    "userId": item["userId"],
                    "name": item["name"],
                    "team": team_label,
                    "teamId": item.get("teamId"),
                    "teamName": item.get("teamName"),
                    "teamLabel": team_label,
                    "entityId": item["entityId"],
                    "entityName": item["entityName"],
                    "totalCredits": item["totalCredits"],
                    "closedCount": item["closedCount"],
                    "pendingCount": item["pendingCount"],
                    "evidenceAdded": item["evidenceAdded"],
                    "avgHours": avg_hours,
                }
            )

        prod_tl_member_ids = set()
        if role_key == "team_leader" and is_prod_entity_user:
            prod_tl_member_ids.update(
                User.objects.filter(team_leader_id=request.user.id).values_list("id", flat=True)
            )
            prod_tl_member_ids.update(
                Team.objects.filter(leader_id=request.user.id, is_active=True).values_list("members__id", flat=True)
            )
            prod_tl_member_ids.discard(None)

        support_tl_team_ids = set()
        if role_key == "team_leader" and not is_prod_entity_user:
            support_tl_team_ids.update(
                Team.objects.filter(leader_id=request.user.id, is_active=True).values_list("id", flat=True)
            )
            support_tl_team_ids.discard(None)

        prod_user_team_member_ids = set()
        if role_key == "user" and is_prod_entity_user:
            if request.user.team_leader_id:
                prod_user_team_member_ids.update(
                    User.objects.filter(team_leader_id=request.user.team_leader_id).values_list("id", flat=True)
                )
                prod_user_team_member_ids.update(
                    Team.objects.filter(leader_id=request.user.team_leader_id, is_active=True).values_list("members__id", flat=True)
                )
                prod_user_team_member_ids.add(request.user.team_leader_id)
            else:
                member_team = Team.objects.filter(is_active=True, members__id=request.user.id).first()
                if member_team:
                    prod_user_team_member_ids.update(member_team.members.values_list("id", flat=True))
                    if member_team.leader_id:
                        prod_user_team_member_ids.add(member_team.leader_id)
            prod_user_team_member_ids.add(request.user.id)
            prod_user_team_member_ids.discard(None)

        def _in_requester_scope(req):
            if role_key == "super_admin":
                return True
            if role_key == "senior":
                if not effective_user_company_id:
                    return False
                return req.company_id == effective_user_company_id
            if role_key == "manager":
                if is_prod_entity_user:
                    if not request.user.entity_id:
                        return False
                    return req.source_entity_id == request.user.entity_id
                if not request.user.entity_id:
                    return False
                return req.target_entity_id == request.user.entity_id
            if role_key == "team_leader":
                if is_prod_entity_user:
                    if not request.user.entity_id or req.source_entity_id != request.user.entity_id:
                        return False
                    requester = req.requester_user
                    if not requester:
                        return False
                    return (
                        requester.id == request.user.id
                        or requester.team_leader_id == request.user.id
                        or requester.id in prod_tl_member_ids
                    )
                if req.target_team_id and req.target_team_id in support_tl_team_ids:
                    return True
                if not req.target_team_id and req.target_team_leader_id == request.user.id:
                    return True
                return False
            if role_key == "user":
                requester = req.requester_user
                if not requester:
                    return False
                if is_prod_entity_user:
                    if not request.user.entity_id or req.source_entity_id != request.user.entity_id:
                        return False
                    if prod_user_team_member_ids:
                        return requester.id in prod_user_team_member_ids
                    return requester.id == request.user.id
                if req.target_team_id:
                    if support_user_target_team_ids:
                        return req.target_team_id in support_user_target_team_ids
                    return False
                if req.target_team_leader_id:
                    return req.target_team_leader_id in support_user_team_leader_ids
                return False
            return False

        def _demand_sort_key(row):
            avg = row.get("avgHours")
            avg_key = avg if isinstance(avg, (int, float)) and avg > 0 else float("inf")
            return (
                -int(row.get("createdCount", 0) or 0),
                -int(row.get("closedCount", 0) or 0),
                int(row.get("pendingCount", 0) or 0),
                avg_key,
                str(row.get("name") or row.get("teamLabel") or "").lower(),
            )

        request_demand_rankings = {
            "sourceCompanies": [],
            "sourceEntities": [],
            "sourceTeams": [],
            "requesters": [],
        }
        if include_requester_rankings:
            demand_qs = ServiceRequest.objects.all()
            if company_id:
                demand_qs = demand_qs.filter(company_id=company_id)
            if target_entity_id:
                demand_qs = demand_qs.filter(target_entity_id=target_entity_id)
            if target_team_id:
                demand_qs = demand_qs.filter(
                    Q(target_team_id=target_team_id)
                    | Q(target_team__leader_id=target_team_id)
                    | Q(target_team_leader_id=target_team_id)
                )
            if source_entity_id:
                demand_qs = demand_qs.filter(source_entity_id=source_entity_id)
            if source_team_id:
                demand_qs = demand_qs.filter(
                    Q(requester_user__team_leader_id=source_team_id)
                    | Q(requester_user_id=source_team_id)
                )
            if requester_user_id:
                demand_qs = demand_qs.filter(requester_user_id=requester_user_id)
            if request_type:
                demand_qs = demand_qs.filter(category=request_type)
            if priority in {
                ServiceRequest.Priority.LOW,
                ServiceRequest.Priority.MEDIUM,
                ServiceRequest.Priority.HIGH,
                ServiceRequest.Priority.CRITICAL,
            }:
                demand_qs = demand_qs.filter(priority=priority)

            demand_qs = demand_qs.select_related(
                "company",
                "source_entity",
                "source_entity__company",
                "target_entity",
                "target_team",
                "target_team__leader",
                "target_team_leader",
                "requester_user",
                "requester_user__team_leader",
                "requester_user__entity",
                "requester_user__entity__company",
                "current_assignee",
            ).distinct()
            demand_list = list(demand_qs)
            range_start = parse_date(date_from) if date_from else None
            range_end = parse_date(date_to) if date_to else None

        if include_requester_rankings:
            def _in_selected_range(dt_value):
                if range_start is None and range_end is None:
                    return True
                if not dt_value:
                    return False
                day_value = dt_value.date() if hasattr(dt_value, "date") else dt_value
                if range_start and day_value < range_start:
                    return False
                if range_end and day_value > range_end:
                    return False
                return True

            source_company_stats = {}
            source_entity_stats = {}
            source_team_stats = {}
            requester_stats = {}
            requester_ids = {req.requester_user_id for req in demand_list if req.requester_user_id}
            requester_role_map = {}
            if requester_ids:
                role_priority = {
                    "user": 1,
                    "team_leader": 2,
                    "manager": 3,
                    "senior": 4,
                    "super_admin": 5,
                }
                for user_id, requester_role in UserRole.objects.filter(user_id__in=requester_ids).values_list("user_id", "role__key"):
                    if role_priority.get(requester_role, 0) >= role_priority.get(requester_role_map.get(user_id, ""), 0):
                        requester_role_map[user_id] = requester_role

            for req in demand_list:
                if not _in_requester_scope(req):
                    continue

                status_value = str(req.status or "").upper()
                resolve_at = req.closed_at or req.completed_at
                created_in_range = _in_selected_range(req.created_at)
                closed_in_range = _in_selected_range(resolve_at)
                is_closed = status_value == ServiceRequest.Status.CLOSED and closed_in_range
                is_pending = status_value == ServiceRequest.Status.COMPLETED and (created_in_range or closed_in_range)
                is_sent_back = status_value in {ServiceRequest.Status.REJECTED, ServiceRequest.Status.IN_PROGRESS} and created_in_range
                row_hours = None
                if resolve_at and req.created_at:
                    row_hours = (resolve_at - req.created_at).total_seconds() / 3600

                requester = req.requester_user
                requester_id = requester.id if requester else None
                requester_name = (
                    (requester.get_full_name() or requester.username).strip()
                    if requester
                    else "Unknown requester"
                )

                source_entity_id_value = req.source_entity_id or (requester.entity_id if requester else None) or "unknown"
                source_entity_name = (
                    req.source_entity.name
                    if req.source_entity_id and req.source_entity
                    else (
                        requester.entity.name
                        if requester and requester.entity_id and requester.entity
                        else "Unknown source entity"
                    )
                )
                source_company_id_value = (
                    (req.source_entity.company_id if req.source_entity_id and req.source_entity else None)
                    or (
                        requester.entity.company_id
                        if requester and requester.entity_id and requester.entity
                        else None
                    )
                    or req.company_id
                    or "unknown"
                )
                source_company_name = (
                    req.source_entity.company.name
                    if req.source_entity_id and req.source_entity and req.source_entity.company_id and req.source_entity.company
                    else (
                        requester.entity.company.name
                        if requester and requester.entity_id and requester.entity and requester.entity.company_id and requester.entity.company
                        else (req.company.name if req.company_id and req.company else "Unknown source company")
                    )
                )

                requester_role_key = requester_role_map.get(requester_id, "")
                if requester_role_key == "team_leader" and requester_id:
                    source_team_leader_id = requester_id
                elif requester_role_key in {"manager", "senior", "super_admin"}:
                    source_team_leader_id = None
                else:
                    source_team_leader_id = requester.team_leader_id if requester else None
                source_team_leader_name = (
                    (requester.get_full_name() or requester.username).strip()
                    if requester and requester_role_key == "team_leader" and requester_id
                    else (
                        (requester.team_leader.get_full_name() or requester.team_leader.username).strip()
                        if requester and requester.team_leader_id and requester.team_leader
                        else ""
                    )
                )
                has_real_source_team = bool(source_team_leader_id and source_team_leader_name)
                source_team_key = (
                    f"tl-{source_team_leader_id}"
                    if has_real_source_team
                    else (f"direct-requester-{requester_id}" if requester_id else f"source-entity-{source_entity_id_value}")
                )
                source_team_label = (
                    f"{source_team_leader_name}'s Team"
                    if has_real_source_team
                    else ""
                )
                if not source_team_label:
                    source_team_label = (
                        f"Direct requester: {requester_name}"
                        if requester_name
                        else (source_entity_name or "Unknown source requester")
                    )

                company_bucket = source_company_stats.setdefault(
                    str(source_company_id_value),
                    {
                        "companyId": source_company_id_value,
                        "name": source_company_name,
                        "createdCount": 0,
                        "closedCount": 0,
                        "pendingCount": 0,
                        "sentBackCount": 0,
                        "hoursTotal": 0.0,
                        "hoursCount": 0,
                    },
                )
                entity_bucket = source_entity_stats.setdefault(
                    str(source_entity_id_value),
                    {
                        "entityId": source_entity_id_value,
                        "name": source_entity_name,
                        "createdCount": 0,
                        "closedCount": 0,
                        "pendingCount": 0,
                        "sentBackCount": 0,
                        "hoursTotal": 0.0,
                        "hoursCount": 0,
                    },
                )
                team_bucket = source_team_stats.setdefault(
                    source_team_key,
                    {
                        "teamKey": source_team_key,
                        "teamLeaderId": source_team_leader_id,
                        "teamLeaderName": source_team_leader_name,
                        "teamLabel": source_team_label,
                        "name": source_team_label,
                        "entityId": source_entity_id_value,
                        "entityName": source_entity_name,
                        "createdCount": 0,
                        "closedCount": 0,
                        "pendingCount": 0,
                        "sentBackCount": 0,
                        "hoursTotal": 0.0,
                        "hoursCount": 0,
                    },
                )
                requester_bucket = requester_stats.setdefault(
                    str(requester_id or "unknown"),
                    {
                        "userId": requester_id,
                        "name": requester_name,
                        "entityId": source_entity_id_value,
                        "entityName": source_entity_name,
                        "sourceTeamLeaderId": source_team_leader_id,
                        "sourceTeamLeaderName": source_team_leader_name,
                        "sourceTeamLabel": source_team_label,
                        "createdCount": 0,
                        "closedCount": 0,
                        "pendingCount": 0,
                        "sentBackCount": 0,
                        "hoursTotal": 0.0,
                        "hoursCount": 0,
                    },
                )

                for bucket in (company_bucket, entity_bucket, team_bucket, requester_bucket):
                    if created_in_range:
                        bucket["createdCount"] += 1
                    if is_closed:
                        bucket["closedCount"] += 1
                    if is_pending:
                        bucket["pendingCount"] += 1
                    if is_sent_back:
                        bucket["sentBackCount"] += 1
                    if is_closed and isinstance(row_hours, (int, float)) and row_hours > 0:
                        bucket["hoursTotal"] += float(row_hours)
                        bucket["hoursCount"] += 1

            def _finalize_request_demand(rows):
                finalized = []
                for item in rows:
                    created_count = int(item.get("createdCount", 0) or 0)
                    closed_count = int(item.get("closedCount", 0) or 0)
                    pending_count = int(item.get("pendingCount", 0) or 0)
                    sent_back_count = int(item.get("sentBackCount", 0) or 0)
                    if created_count <= 0 and closed_count <= 0 and pending_count <= 0 and sent_back_count <= 0:
                        continue
                    avg_hours = item["hoursTotal"] / item["hoursCount"] if item["hoursCount"] else 0
                    payload = {
                        **item,
                        "completionRate": int(round((closed_count / created_count) * 100)) if created_count else 0,
                        "avgHours": avg_hours,
                        "created_count": created_count,
                        "closed_count": closed_count,
                        "pending_count": pending_count,
                        "sent_back_count": sent_back_count,
                        "completion_rate": int(round((closed_count / created_count) * 100)) if created_count else 0,
                        "avg_hours": avg_hours,
                    }
                    payload.pop("hoursTotal", None)
                    payload.pop("hoursCount", None)
                    finalized.append(payload)
                return sorted(finalized, key=_demand_sort_key)

            request_demand_rankings = {
                "sourceCompanies": _finalize_request_demand(source_company_stats.values()),
                "sourceEntities": _finalize_request_demand(source_entity_stats.values()),
                "sourceTeams": _finalize_request_demand(source_team_stats.values()),
                "requesters": _finalize_request_demand(requester_stats.values()),
            }

        return Response(
            {
                "solves": solves,
                "users": list(user_map.values()),
                "entities": list(entity_map.values()),
                "entityRankings": _sort_rankings(entity_rankings),
                "teamRankings": _sort_rankings(team_rankings),
                "peopleRankings": _sort_rankings(people_rankings),
                "requestDemandRankings": request_demand_rankings,
                "requesterRankings": request_demand_rankings,
            }
        )


class CreditsEvidenceCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        service_request = get_visible_requests_queryset(request.user).filter(id=request_id).first()
        if service_request is None:
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)

        if service_request.status not in {ServiceRequest.Status.COMPLETED, ServiceRequest.Status.CLOSED}:
            return Response(
                {"detail": "Credits proof can only be added after the request is solved."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        completed_by_id = (
            RequestStatusHistory.objects.filter(
                request_id=service_request.id,
                new_status=ServiceRequest.Status.COMPLETED,
            )
            .order_by("-changed_at")
            .values_list("changed_by_id", flat=True)
            .first()
        )
        closed_by_id = (
            RequestStatusHistory.objects.filter(
                request_id=service_request.id,
                new_status=ServiceRequest.Status.CLOSED,
            )
            .order_by("-changed_at")
            .values_list("changed_by_id", flat=True)
            .first()
        )
        solver_id = completed_by_id or closed_by_id or service_request.current_assignee_id
        actor_role = get_primary_role_key(request.user)
        target_entity_id = get_request_target_entity_id(service_request)
        if actor_role not in {"user", "team_leader", "manager"}:
            return Response(
                {"detail": "Only target team members can add credits evidence."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not request.user.entity_id or not target_entity_id or request.user.entity_id != target_entity_id:
            return Response(
                {"detail": "Evidence can only be added by users from the request target team."},
                status=status.HTTP_403_FORBIDDEN,
            )
        is_target_team_manager = (
            actor_role == "manager"
            and request.user.entity_id
            and target_entity_id
            and request.user.entity_id == target_entity_id
        )
        if request.user.id != solver_id and not is_target_team_manager:
            return Response(
                {"detail": "Only the solver or target team manager can add credits evidence."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RequestCommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = serializer.validated_data.get("message", "").strip()
        attachment = serializer.validated_data.get("attachment")

        has_attachment = bool(attachment)
        message_lines = ["Credits evidence"]
        
        if attachment:
            message_lines.append("type: file")
        else:
            message_lines.append("type: link")
        
        if note:
            message_lines.append(f"note: {note}")

        RequestMessage.objects.create(
            request=service_request,
            sender=request.user,
            message="\n".join(message_lines),
            attachment=attachment,
        )
        return Response({"detail": "Evidence saved."}, status=status.HTTP_201_CREATED)


class CreditsEvidenceDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_user_scope_role(self, user):
        from apps.permissions_app.models import UserRole
        
        user_roles = UserRole.objects.filter(user=user).values_list('role', flat=True)
        
        if 'super_admin' in user_roles:
            return 'super_admin'
        if 'senior' in user_roles:
            return 'senior'
        if 'manager' in user_roles:
            return 'manager'
        if 'team_leader' in user_roles:
            return 'team_leader'
        return 'user'

    def _can_delete_evidence(self, user, request_obj, evidence_message):
        user_role = self._get_user_scope_role(user)
        
        solver_id = request_obj.completed_by_id or request_obj.closed_by_id or request_obj.current_assignee_id
        
        if evidence_message.sender_id == user.id:
            return True
        
        if user_role == 'super_admin':
            return True
        
        if user_role in ['senior', 'manager'] and user.company_id == request_obj.company_id:
            return True
        
        if user_role == 'team_leader':
            if user.entity_id == request_obj.target_entity_id:
                return True
            if user.entity_id == request_obj.source_entity_id:
                return True
        
        return False

    def delete(self, request, request_id, message_id):
        service_request = get_visible_requests_queryset(request.user).filter(id=request_id).first()
        if service_request is None:
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)

        if service_request.status not in {ServiceRequest.Status.COMPLETED, ServiceRequest.Status.CLOSED}:
            return Response(
                {"detail": "Evidence can only be removed from solved requests."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        evidence_message = RequestMessage.objects.filter(
            id=message_id,
            request_id=request_id
        ).first()
        
        if evidence_message is None:
            return Response({"detail": "Evidence not found."}, status=status.HTTP_404_NOT_FOUND)

        message_text = evidence_message.message or ""
        is_credit_evidence = (
            message_text.strip().lower().startswith("credits evidence") or
            message_text.strip().lower().startswith("credits proof")
        )
        
        if not is_credit_evidence:
            return Response({"detail": "Evidence not found."}, status=status.HTTP_404_NOT_FOUND)

        if not self._can_delete_evidence(request.user, service_request, evidence_message):
            return Response(
                {"detail": "You do not have permission to remove this evidence."},
                status=status.HTTP_403_FORBIDDEN,
            )

        evidence_message.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RequestListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = get_visible_requests_queryset(request.user, include_related=True)
        queryset = apply_scope_filters(queryset, request.user, request.query_params.get("scope"))
        team_queue_scope = str(request.query_params.get("team_queue", "")).strip().lower() in {
            "1",
            "true",
            "yes",
        }
        if team_queue_scope:
            role_key = get_primary_role_key(request.user)
            is_prod_entity_user = (
                (getattr(getattr(request.user, "entity", None), "entity_type", "") or "").upper()
                == Entity.EntityType.PROD
            )
            if role_key == "team_leader":
                team_member_ids = list(
                    request.user.__class__.objects.filter(
                        team_leader_id=request.user.id,
                        is_active=True,
                    ).values_list("id", flat=True)
                )
                team_member_ids.append(request.user.id)
                if is_prod_entity_user:
                    queryset = queryset.filter(requester_user_id__in=team_member_ids)
                else:
                    queryset = queryset.filter(
                        Q(current_assignee_id__in=team_member_ids)
                        | Q(target_team_id__isnull=False, target_team__leader_id=request.user.id)
                        | Q(
                            target_team_id__isnull=True,
                            target_team_leader_id__isnull=False,
                            target_team_leader_id=request.user.id,
                        )
                    )
            elif role_key == "user":
                # Normal users use personal queue scope only:
                # - PROD-side users: requests they created (requester-side validation flow)
                # - Target/support users: requests assigned to them (solver-side flow)
                if is_prod_entity_user:
                    queryset = queryset.filter(requester_user_id=request.user.id)
                else:
                    queryset = queryset.filter(current_assignee_id=request.user.id)
            actor_scope = (request.query_params.get("actor_scope") or "all").strip().lower()
            is_prod_requester_scope = (
                role_key in {"team_leader", "user"}
                and bool(request.user.entity_id)
                and request.user.entity
                and request.user.entity.entity_type == Entity.EntityType.PROD
            )
            actor_field = "requester_user__username" if is_prod_requester_scope else "current_assignee__username"
            actor_exists_q = Q(**{f"{actor_field}__isnull": False})
            actor_me_q = Q(**{f"{actor_field}__iexact": request.user.username})
            if actor_scope == "me":
                queryset = queryset.filter(actor_me_q)
            elif actor_scope == "members":
                queryset = queryset.filter(actor_exists_q).exclude(actor_me_q)
        counts_only = str(request.query_params.get("team_queue_counts", "")).strip().lower() in {
            "1",
            "true",
            "yes",
        }
        rejected_q = Q(
            status=ServiceRequest.Status.IN_PROGRESS,
            status_history__old_status=ServiceRequest.Status.COMPLETED,
            status_history__new_status=ServiceRequest.Status.IN_PROGRESS,
        )
        waiting_q = Q(status=ServiceRequest.Status.COMPLETED)
        closed_q = Q(status=ServiceRequest.Status.CLOSED)
        assigned_q = ~waiting_q & ~closed_q & ~rejected_q
        if counts_only:
            filtered_queryset = apply_request_filters(queryset, request.query_params)
            payload = {
                "assigned": filtered_queryset.filter(assigned_q).distinct().count(),
                "waiting": filtered_queryset.filter(waiting_q).distinct().count(),
                "sent_back": filtered_queryset.filter(rejected_q).distinct().count(),
                "closed": filtered_queryset.filter(closed_q).distinct().count(),
            }
            return Response(payload)
        queryset = apply_request_filters(queryset, request.query_params)
        team_bucket = (request.query_params.get("team_bucket") or "").strip().lower()
        if team_bucket == "assigned":
            queryset = queryset.filter(assigned_q).distinct()
        elif team_bucket == "waiting":
            queryset = queryset.filter(waiting_q).distinct()
        elif team_bucket in {"sent_back", "sent-back", "sentback"}:
            queryset = queryset.filter(rejected_q).distinct()
        elif team_bucket == "closed":
            queryset = queryset.filter(closed_q).distinct()
        skip_count = str(request.query_params.get("skip_count", "")).strip().lower() in {
            "1",
            "true",
            "yes",
        }

        if skip_count:
            try:
                page_size = int(request.query_params.get("page_size", 20))
            except (TypeError, ValueError):
                page_size = 20
            page_size = max(1, min(page_size, 1000))
            cache_scope = {
                "user_id": request.user.id,
                "scope": request.query_params.get("scope", ""),
                "search": request.query_params.get("search", ""),
                "company_id": request.query_params.get("company_id", ""),
                "source_entity_id": request.query_params.get("source_entity_id", ""),
                "target_entity_id": request.query_params.get("target_entity_id", ""),
                "type": request.query_params.get("type", ""),
                "status": request.query_params.get("status", ""),
                "assignee": request.query_params.get("assignee", ""),
                "stuck": request.query_params.get("stuck", ""),
                "page_size": page_size,
            }
            cache_digest = hashlib.md5(
                json.dumps(cache_scope, sort_keys=True, default=str).encode("utf-8")
            ).hexdigest()
            cache_key = f"requests:list:skip:{cache_digest}"
            cached_payload = cache.get(cache_key)
            if cached_payload is not None:
                return Response(cached_payload)

            rows = list(queryset[:page_size])
            mark_requests_stuck(rows)
            serializer = RequestSummarySerializer(rows, many=True)
            payload = {
                "count": None,
                "next": None,
                "previous": None,
                "results": serializer.data,
            }
            cache.set(cache_key, payload, timeout=30)
            return Response(payload)

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
        if not can_create_requests(request.user):
            return Response(
                {"detail": "You do not have permission to create requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = RequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role_keys = set(get_user_role_keys(request.user))

        selected_company = request.user.company
        selected_source_entity = request.user.entity

        if "super_admin" in role_keys:
            company_id = serializer.validated_data.get("company_id")
            source_entity_id = serializer.validated_data.get("source_entity_id")
            if not company_id or not source_entity_id:
                return Response(
                    {
                        "detail": "Super admin must choose a company and a production source entity."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            selected_company = Company.objects.filter(id=company_id, is_active=True).first()
            if selected_company is None:
                return Response(
                    {"detail": "Selected company not found."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            selected_source_entity = Entity.objects.filter(
                id=source_entity_id,
                company_id=selected_company.id,
                entity_type=Entity.EntityType.PROD,
                is_active=True,
            ).first()
            if selected_source_entity is None:
                return Response(
                    {
                        "detail": "Selected source entity must be a production entity from the selected company."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif "senior" in role_keys:
            if not request.user.company_id:
                return Response(
                    {"detail": "You must belong to a company to create requests."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            source_entity_id = serializer.validated_data.get("source_entity_id")
            if not source_entity_id:
                return Response(
                    {"detail": "Senior must choose a production source entity."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            selected_company = request.user.company
            selected_source_entity = Entity.objects.filter(
                id=source_entity_id,
                company_id=request.user.company_id,
                entity_type=Entity.EntityType.PROD,
                is_active=True,
            ).first()
            if selected_source_entity is None:
                return Response(
                    {
                        "detail": "Selected source entity must be a production entity from your company."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            if not request.user.company_id or not request.user.entity_id:
                return Response(
                    {
                        "detail": "You must belong to a company and source entity to create requests."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            if request.user.entity.entity_type != Entity.EntityType.PROD:
                return Response(
                    {"detail": "Requests can only be created from production entities."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        target_entity = Entity.objects.filter(
            id=serializer.validated_data["target_team"],
            company_id=selected_company.id if selected_company else None,
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
        if (
            {"manager", "team_leader"} & role_keys
            and "super_admin" not in role_keys
            and "senior" not in role_keys
        ):
            if not selected_source_entity or selected_source_entity.id != request.user.entity_id:
                return Response(
                    {
                        "detail": "Managers and team leaders can create requests only from their own source entity."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
        requester_unit = get_or_create_unit_for_entity(selected_source_entity)
        target_unit = get_or_create_unit_for_entity(target_entity)
        requester_primary_role = get_primary_role_key(request.user)
        submit_to_target_now = requester_primary_role != "user" or has_permission(
            request.user, "approve_request"
        )

        service_request = ServiceRequest.objects.create(
            request_number=f"REQ-{timezone.now():%Y%m%d%H%M%S%f}",
            title=serializer.validated_data["title"],
            description=serializer.validated_data.get("description", ""),
            attachment=serializer.validated_data.get("attachment"),
            category=serializer.validated_data["type"],
            priority=serializer.validated_data.get(
                "priority", ServiceRequest.Priority.MEDIUM
            ),
            requester_user=request.user,
            company=selected_company,
            source_entity=selected_source_entity,
            target_entity=target_entity,
            requester_unit=requester_unit,
            target_unit=target_unit,
            is_submitted_to_target=submit_to_target_now,
        )
        mirror_request_created_to_telegram(service_request)
        if submit_to_target_now:
            recipients = resolve_request_notification_recipients(service_request)
            recipients = filter_recipients_by_request_visibility(service_request, recipients)
            create_bulk_notifications(
                users=recipients,
                event_type=UserNotification.EventType.REQUEST_CREATED,
                title=f"New request {service_request.request_number}",
                message=(
                    f"{request.user.username} created a new request: "
                    f"{service_request.title}"
                ),
                link=f"/requests/{service_request.id}",
                metadata={
                    "request_id": service_request.id,
                    "request_number": service_request.request_number,
                },
            )
        else:
            pending_approvers = get_pending_approval_team_leaders(
                service_request,
                exclude_user_id=request.user.id,
            )
            create_bulk_notifications(
                users=pending_approvers,
                event_type=UserNotification.EventType.REQUEST_CREATED,
                title=f"Pending approval: {service_request.request_number}",
                message=(
                    f"{request.user.username} created a request pending your approval: "
                    f"{service_request.title}"
                ),
                link=f"/requests/{service_request.id}",
                metadata={
                    "request_id": service_request.id,
                    "request_number": service_request.request_number,
                },
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

    def delete(self, request, request_id):
        service_request = self.get_object(request_id)
        if service_request is None or not self.has_access(request.user, service_request):
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        can_delete = (
            has_any_permission(
                request.user,
                {"approve_request", "assign_request", "resolve_request", "close_request"},
            )
            or request.user.is_staff
        )
        if not can_delete:
            return Response(
                {"detail": "You do not have permission to delete this request."},
                status=status.HTTP_403_FORBIDDEN,
            )
        service_request.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RequestCommentCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def has_access(self, user, service_request):
        return get_visible_requests_queryset(user).filter(id=service_request.id).exists()

    def post(self, request, request_id):
        service_request = ServiceRequest.objects.filter(id=request_id).first()
        if service_request is None or not self.has_access(request.user, service_request):
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        can_view_discussion = can_use_request_permission(
            request.user,
            service_request,
            "request.view_discussion",
            has_permission(request.user, "view_request_discussion"),
        )
        if not can_view_discussion:
            return Response(
                {"detail": "You do not have permission to view request discussion."},
                status=status.HTTP_403_FORBIDDEN,
            )
        can_comment = can_use_request_permission(
            request.user,
            service_request,
            "request.comment",
            has_permission(request.user, "comment_request"),
        )
        if not can_comment:
            return Response(
                {"detail": "You do not have permission to comment on requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if service_request.status in {ServiceRequest.Status.REJECTED, ServiceRequest.Status.CLOSED}:
            return Response(
                {"detail": "Discussion is closed for rejected or closed requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = RequestCommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reply_to_comment = None
        reply_to_comment_id = serializer.validated_data.get("reply_to_comment_id")
        if reply_to_comment_id:
            reply_to_comment = RequestMessage.objects.filter(
                id=reply_to_comment_id, request_id=request_id
            ).first()
            if reply_to_comment is None:
                return Response({"detail": "Reply target comment not found."}, status=status.HTTP_400_BAD_REQUEST)
        request_message = RequestMessage.objects.create(
            request=service_request,
            sender=request.user,
            reply_to_comment=reply_to_comment,
            message=serializer.validated_data.get("message", ""),
            attachment=serializer.validated_data.get("attachment"),
        )
        recipients = resolve_request_notification_recipients(service_request)
        recipients = filter_recipients_by_request_visibility(service_request, recipients)
        create_bulk_notifications(
            users=recipients,
            event_type=UserNotification.EventType.REQUEST_MESSAGE,
            title=f"New message on {service_request.request_number}",
            message=f"{request.user.username}: {request_message.message}",
            link=f"/requests/{service_request.id}",
            metadata={
                "request_id": service_request.id,
                "request_number": service_request.request_number,
                "message_id": request_message.id,
            },
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


class RequestCommentUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def has_access(self, user, service_request):
        return get_visible_requests_queryset(user).filter(id=service_request.id).exists()

    def patch(self, request, request_id, comment_id):
        service_request = ServiceRequest.objects.filter(id=request_id).first()
        if service_request is None or not self.has_access(request.user, service_request):
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        can_view_discussion = can_use_request_permission(
            request.user,
            service_request,
            "request.view_discussion",
            has_permission(request.user, "view_request_discussion"),
        )
        if not can_view_discussion:
            return Response(
                {"detail": "You do not have permission to view request discussion."},
                status=status.HTTP_403_FORBIDDEN,
            )
        can_comment = can_use_request_permission(
            request.user,
            service_request,
            "request.comment",
            has_permission(request.user, "comment_request"),
        )
        if not can_comment:
            return Response(
                {"detail": "You do not have permission to edit request comments."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if service_request.status in {ServiceRequest.Status.REJECTED, ServiceRequest.Status.CLOSED}:
            return Response(
                {"detail": "Discussion is closed for rejected or closed requests."},
                status=status.HTTP_403_FORBIDDEN,
            )

        comment = RequestMessage.objects.filter(id=comment_id, request_id=request_id).first()
        if comment is None:
            return Response({"detail": "Comment not found."}, status=status.HTTP_404_NOT_FOUND)
        if comment.sender_id != request.user.id:
            return Response(
                {"detail": "You can only edit your own messages."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RequestCommentUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment.message = serializer.validated_data["message"].strip()
        comment.edited_at = timezone.now()
        comment.save(update_fields=["message", "edited_at"])
        mirror_request_message_edited_to_telegram(service_request, comment)

        service_request = load_request(request_id)
        mark_request_stuck(service_request)
        return Response(
            RequestDetailSerializer(
                service_request,
                context=build_request_detail_context(request, service_request),
            ).data
        )


class RequestCommentPinView(APIView):
    permission_classes = [IsAuthenticated]

    def has_access(self, user, service_request):
        return get_visible_requests_queryset(user).filter(id=service_request.id).exists()

    def post(self, request, request_id, comment_id):
        service_request = ServiceRequest.objects.filter(id=request_id).first()
        if service_request is None or not self.has_access(request.user, service_request):
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        can_view_discussion = can_use_request_permission(
            request.user,
            service_request,
            "request.view_discussion",
            has_permission(request.user, "view_request_discussion"),
        )
        if not can_view_discussion:
            return Response(
                {"detail": "You do not have permission to view request discussion."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not can_pin_request_message(request.user, service_request):
            return Response(
                {"detail": "You do not have permission to pin request comments."},
                status=status.HTTP_403_FORBIDDEN,
            )
        comment = RequestMessage.objects.filter(id=comment_id, request_id=request_id).first()
        if comment is None:
            return Response({"detail": "Comment not found."}, status=status.HTTP_404_NOT_FOUND)
        should_pin = bool(request.data.get("pinned", True))
        if should_pin:
            RequestMessage.objects.filter(request_id=request_id, is_pinned=True).update(
                is_pinned=False,
                pinned_at=None,
                pinned_by=None,
            )
            comment.is_pinned = True
            comment.pinned_at = timezone.now()
            comment.pinned_by = request.user
            comment.save(update_fields=["is_pinned", "pinned_at", "pinned_by"])
            pin_request_message_in_telegram(service_request, comment)
        else:
            comment.is_pinned = False
            comment.pinned_at = None
            comment.pinned_by = None
            comment.save(update_fields=["is_pinned", "pinned_at", "pinned_by"])
            unpin_request_message_in_telegram(service_request)
        service_request = load_request(request_id)
        mark_request_stuck(service_request)
        return Response(
            RequestDetailSerializer(
                service_request,
                context=build_request_detail_context(request, service_request),
            ).data
        )


class RequestCommentDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def has_access(self, user, service_request):
        return get_visible_requests_queryset(user).filter(id=service_request.id).exists()

    def get(self, request, request_id, comment_id):
        service_request = ServiceRequest.objects.filter(id=request_id).first()
        if service_request is None or not self.has_access(request.user, service_request):
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        can_view_discussion = can_use_request_permission(
            request.user,
            service_request,
            "request.view_discussion",
            has_permission(request.user, "view_request_discussion"),
        )
        if not can_view_discussion:
            return Response(
                {"detail": "You do not have permission to view request discussion."},
                status=status.HTTP_403_FORBIDDEN,
            )

        comment = RequestMessage.objects.filter(id=comment_id, request_id=request_id).first()
        if comment is None:
            return Response({"detail": "Comment not found."}, status=status.HTTP_404_NOT_FOUND)
        if not comment.attachment:
            return Response({"detail": "No attachment on this comment."}, status=status.HTTP_404_NOT_FOUND)

        message_text = (comment.message or "").strip().lower()
        is_credit_evidence = message_text.startswith("credits evidence") or message_text.startswith("credits proof")
        if not is_credit_evidence:
            return Response({"detail": "Attachment is not evidence."}, status=status.HTTP_400_BAD_REQUEST)

        attachment_name = comment.attachment.name.rsplit("/", 1)[-1] or "evidence-file"
        try:
            stream = comment.attachment.open("rb")
        except OSError:
            return Response({"detail": "Could not open attachment."}, status=status.HTTP_404_NOT_FOUND)
        return FileResponse(stream, as_attachment=True, filename=attachment_name)


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
        requested_status = serializer.validated_data["status"]
        note = serializer.validated_data.get("note", "")
        deadline_date = serializer.validated_data.get("deadline_date")
        evidence_link = (serializer.validated_data.get("evidence_link") or "").strip()
        evidence_attachment = serializer.validated_data.get("evidence_attachment")
        evidence_links = []
        if evidence_link:
            evidence_links.append(evidence_link)
        raw_evidence_links = []
        if hasattr(request.data, "getlist"):
            raw_evidence_links.extend(request.data.getlist("evidence_links"))
            raw_evidence_links.extend(request.data.getlist("evidence_links[]"))
        elif request.data.get("evidence_links"):
            raw_evidence_links.append(request.data.get("evidence_links"))
        elif request.data.get("evidence_links[]"):
            raw_evidence_links.append(request.data.get("evidence_links[]"))
        for raw_item in raw_evidence_links:
            for item in re.split(r"[\r\n,]+", str(raw_item or "")):
                clean = item.strip()
                if clean:
                    evidence_links.append(clean)
        # Preserve order while deduplicating.
        deduped_evidence_links = []
        seen_links = set()
        for link in evidence_links:
            if link not in seen_links:
                deduped_evidence_links.append(link)
                seen_links.add(link)
        evidence_links = deduped_evidence_links
        url_validator = URLValidator()
        for link in evidence_links:
            try:
                url_validator(link)
            except DjangoValidationError:
                return Response(
                    {"detail": f"Invalid evidence URL: {link}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        evidence_attachments = []
        if evidence_attachment is not None:
            evidence_attachments.append(evidence_attachment)
        if hasattr(request.FILES, "getlist"):
            evidence_attachments.extend(request.FILES.getlist("evidence_attachments"))
        # Preserve order while deduplicating file objects by identity.
        deduped_attachments = []
        seen_file_ids = set()
        for file_obj in evidence_attachments:
            marker = id(file_obj)
            if marker not in seen_file_ids:
                deduped_attachments.append(file_obj)
                seen_file_ids.add(marker)
        evidence_attachments = deduped_attachments
        if (
            old_status == ServiceRequest.Status.COMPLETED
            and requested_status == ServiceRequest.Status.IN_PROGRESS
        ):
            rejection_reason = (serializer.validated_data.get("rejection_reason") or "").strip()
            rejection_note = (serializer.validated_data.get("rejection_note") or "").strip()
            note_lines = [line for line in [rejection_reason, rejection_note] if line]
            if note_lines:
                note = "\n".join(note_lines)
            elif not note.strip():
                note = "Result rejected"
        if evidence_links or evidence_attachments:
            actor_role = get_primary_role_key(request.user)
            target_entity_id = get_request_target_entity_id(service_request)
            if actor_role not in {"user", "team_leader", "manager"}:
                return Response(
                    {"detail": "Only target team members can add credits evidence."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if not request.user.entity_id or not target_entity_id or request.user.entity_id != target_entity_id:
                return Response(
                    {"detail": "Evidence can only be added by users from the request target team."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        allowed_transitions = get_allowed_status_transitions(request.user, service_request)
        if requested_status not in allowed_transitions:
            return Response(
                {"detail": "You do not have permission to set this request status."},
                status=status.HTTP_403_FORBIDDEN,
            )

        submit_to_target_on_approve = (
            old_status == ServiceRequest.Status.NEW
            and not service_request.is_submitted_to_target
            and requested_status == ServiceRequest.Status.ACCEPTED
        )
        can_actor_edit_deadline = can_edit_request_deadline(request.user, service_request)
        if deadline_date and not can_actor_edit_deadline:
            return Response(
                {"detail": "Only target entity users can set request deadlines."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if (
            requested_status == ServiceRequest.Status.ACCEPTED
            and can_actor_edit_deadline
            and not submit_to_target_on_approve
            and not deadline_date
            and not service_request.deadline_date
        ):
            return Response(
                {"detail": "Please set an approximate deadline when accepting this request."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        was_pending_request = (
            old_status == ServiceRequest.Status.NEW and not service_request.is_submitted_to_target
        )
        # Approving a pending requester-side request should submit it to the
        # target queue while keeping lifecycle status NEW.
        effective_new_status = (
            ServiceRequest.Status.NEW if submit_to_target_on_approve else requested_status
        )
        service_request.status = effective_new_status
        update_fields = ["status"]
        if submit_to_target_on_approve:
            service_request.is_submitted_to_target = True
            update_fields.append("is_submitted_to_target")
        # Pending-approval decisions must not auto-assign. Requests should reach
        # the target queue unassigned so support/dev managers and TLs can assign.
        if was_pending_request:
            if service_request.current_assignee_id is not None:
                service_request.current_assignee = None
                update_fields.append("current_assignee")
        # Status decisions (accept/reject/progress/close) must not implicitly assign
        # ownership. Assignment is handled only through explicit assignment actions.
        if (
            effective_new_status == ServiceRequest.Status.ACCEPTED
            and service_request.accepted_at is None
        ):
            service_request.accepted_at = timezone.now()
            update_fields.append("accepted_at")
        if effective_new_status == ServiceRequest.Status.COMPLETED:
            service_request.completed_at = timezone.now()
            service_request.resolution_note = note
            update_fields.extend(["completed_at", "resolution_note"])
        if (
            effective_new_status == ServiceRequest.Status.IN_PROGRESS
            and old_status == ServiceRequest.Status.COMPLETED
        ):
            service_request.completed_at = None
            service_request.rejection_reason = note.splitlines()[0].strip() if note.strip() else ""
            note_lines = [line.strip() for line in note.splitlines() if line.strip()]
            service_request.resolution_note = "\n".join(note_lines[1:]) if len(note_lines) > 1 else ""
            update_fields.extend(["completed_at", "rejection_reason", "resolution_note"])
        if effective_new_status == ServiceRequest.Status.CLOSED:
            service_request.closed_at = timezone.now()
            service_request.resolution_note = note
            update_fields.extend(["closed_at", "resolution_note"])
        if effective_new_status == ServiceRequest.Status.REJECTED:
            service_request.rejection_reason = note
            service_request.resolution_note = note
            update_fields.extend(["rejection_reason", "resolution_note"])
        if deadline_date:
            service_request.deadline_date = deadline_date
            update_fields.append("deadline_date")
        service_request.save(update_fields=update_fields)
        RequestStatusHistory.objects.create(
            request=service_request,
            old_status=old_status,
            new_status=effective_new_status,
            changed_by=request.user,
            note=note,
        )
        status_labels = dict(ServiceRequest.Status.choices)
        if submit_to_target_on_approve:
            progress_message = (
                "Approval decision: Approved and sent to target queue. "
                "Status remains NEW."
            )
        else:
            progress_message = (
                f"Progress updated: {status_labels.get(old_status, old_status)}"
                f" -> {status_labels.get(effective_new_status, effective_new_status)}"
            )
        if note.strip():
            progress_message = f"{progress_message}\nNote: {note.strip()}"
        request_message = RequestMessage.objects.create(
            request=service_request,
            sender=request.user,
            message=progress_message,
        )
        evidence_request_messages = []
        if effective_new_status == ServiceRequest.Status.COMPLETED and (
            evidence_links or evidence_attachments
        ):
            if evidence_links:
                link_lines = ["Credits evidence"]
                for index, link in enumerate(evidence_links, start=1):
                    link_lines.append(f"Link {index}: {link}")
                evidence_request_messages.append(
                    RequestMessage.objects.create(
                        request=service_request,
                        sender=request.user,
                        message="\n".join(link_lines),
                    )
                )
            for file_obj in evidence_attachments:
                evidence_request_messages.append(
                    RequestMessage.objects.create(
                        request=service_request,
                        sender=request.user,
                        message="Credits evidence",
                        attachment=file_obj,
                    )
                )
        decision_recipient_exclude = None
        if was_pending_request and requested_status in {
            ServiceRequest.Status.ACCEPTED,
            ServiceRequest.Status.REJECTED,
        }:
            decision_label = "approved" if requested_status == ServiceRequest.Status.ACCEPTED else "rejected"
            create_notification(
                user=service_request.requester_user,
                event_type=UserNotification.EventType.REQUEST_MESSAGE,
                title=f"Request {decision_label}: {service_request.request_number}",
                message=(
                    f"{request.user.username} {decision_label} your request "
                    f"{service_request.request_number}."
                ),
                link=f"/requests/{service_request.id}",
                metadata={
                    "request_id": service_request.id,
                    "request_number": service_request.request_number,
                },
            )
            decision_recipient_exclude = service_request.requester_user_id
        recipients = resolve_request_notification_recipients(
            service_request,
            exclude_user_id=decision_recipient_exclude,
        )
        recipients = filter_recipients_by_request_visibility(service_request, recipients)
        create_bulk_notifications(
            users=recipients,
            event_type=UserNotification.EventType.REQUEST_MESSAGE,
            title=f"Progress updated on {service_request.request_number}",
            message=f"{request.user.username}: {progress_message}",
            link=f"/requests/{service_request.id}",
            metadata={
                "request_id": service_request.id,
                "request_number": service_request.request_number,
                "message_id": request_message.id,
            },
        )
        if (
            service_request.current_assignee_id
            and service_request.current_assignee_id != request.user.id
            and not recipients.filter(id=service_request.current_assignee_id).exists()
        ):
            owner_user = User.objects.filter(id=service_request.current_assignee_id, is_active=True).first()
            if owner_user:
                create_notification(
                    user=owner_user,
                    event_type=UserNotification.EventType.REQUEST_MESSAGE,
                    title=f"Progress updated on {service_request.request_number}",
                    message=f"{request.user.username}: {progress_message}",
                    link=f"/requests/{service_request.id}",
                    metadata={
                        "request_id": service_request.id,
                        "request_number": service_request.request_number,
                        "message_id": request_message.id,
                    },
                )
        if submit_to_target_on_approve:
            recipients = resolve_request_notification_recipients(
                service_request,
                exclude_user_id=decision_recipient_exclude,
            )
            recipients = filter_recipients_by_request_visibility(service_request, recipients)
            create_bulk_notifications(
                users=recipients,
                event_type=UserNotification.EventType.REQUEST_CREATED,
                title=f"Approved and sent {service_request.request_number}",
                message=(
                    f"{request.user.username} approved and sent request: "
                    f"{service_request.title}"
                ),
                link=f"/requests/{service_request.id}",
                metadata={
                    "request_id": service_request.id,
                    "request_number": service_request.request_number,
                },
            )
        mirror_request_message_to_telegram(service_request, request_message)
        for evidence_request_message in evidence_request_messages:
            mirror_request_message_to_telegram(service_request, evidence_request_message)
        service_request = load_request(request_id)
        mark_request_stuck(service_request)
        return Response(
            RequestDetailSerializer(
                service_request,
                context=build_request_detail_context(request, service_request),
            ).data
        )


class RequestDeadlineUpdateView(APIView):
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
        if not can_edit_request_deadline(request.user, service_request):
            return Response(
                {"detail": "Only target entity users can edit the deadline."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RequestDeadlineUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service_request.deadline_date = serializer.validated_data["deadline_date"]
        service_request.save(update_fields=["deadline_date"])

        message_text = (
            "Approximate deadline updated to "
            f"{service_request.deadline_date.isoformat()}."
        )
        request_message = RequestMessage.objects.create(
            request=service_request,
            sender=request.user,
            message=message_text,
        )
        recipients = resolve_request_notification_recipients(service_request)
        recipients = filter_recipients_by_request_visibility(service_request, recipients)
        create_bulk_notifications(
            users=recipients,
            event_type=UserNotification.EventType.REQUEST_MESSAGE,
            title=f"Deadline updated on {service_request.request_number}",
            message=f"{request.user.username}: {message_text}",
            link=f"/requests/{service_request.id}",
            metadata={
                "request_id": service_request.id,
                "request_number": service_request.request_number,
                "message_id": request_message.id,
            },
        )
        if (
            service_request.current_assignee_id
            and service_request.current_assignee_id != request.user.id
            and not recipients.filter(id=service_request.current_assignee_id).exists()
        ):
            owner_user = User.objects.filter(id=service_request.current_assignee_id, is_active=True).first()
            if owner_user:
                create_notification(
                    user=owner_user,
                    event_type=UserNotification.EventType.REQUEST_MESSAGE,
                    title=f"Deadline updated on {service_request.request_number}",
                    message=f"{request.user.username}: {message_text}",
                    link=f"/requests/{service_request.id}",
                    metadata={
                        "request_id": service_request.id,
                        "request_number": service_request.request_number,
                        "message_id": request_message.id,
                    },
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
        if not can_assign_request(request.user, service_request):
            return Response(
                {"detail": "You do not have permission to assign this request."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not service_request.is_submitted_to_target:
            return Response(
                {"detail": "Pending requests cannot be assigned before approval."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        actor_role = get_primary_role_key(request.user)
        if actor_role == "senior":
            return Response(
                {
                    "detail": "Senior users cannot assign a request to themselves. Please assign it to a Team Leader in the target entity."
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if (
            actor_role in {"manager", "team_leader"}
            and request.user.entity_id
            and request.user.entity.entity_type == Entity.EntityType.PROD
        ):
            return Response(
                {
                    "detail": "Assignment is only allowed for support/dev manager and team leader flows."
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if actor_role == "team_leader" and not can_tl_own_request(request.user, service_request):
            return Response(
                {"detail": "You can only take requests owned by your team."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if service_request.current_assignee_id is not None:
            return Response(
                {"detail": "This request is already assigned to someone."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service_request.current_assignee = request.user
        service_request.save(update_fields=["current_assignee"])
        RequestAssignmentHistory.objects.create(
            request=service_request,
            assigned_by=request.user,
            assignee=request.user,
            note="Assigned to self",
        )
        if actor_role == "team_leader":
            mirror_request_assignment_to_telegram(
                service_request=service_request,
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

        if not can_assign_request(request.user, service_request):
            return Response(
                {"detail": "You do not have permission to assign this request."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not service_request.is_submitted_to_target:
            return Response(
                {"detail": "Pending requests cannot be assigned before approval."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RequestAssignUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_id = serializer.validated_data["user_id"]
        note = serializer.validated_data.get("note", "Assigned via delegation")

        assignee = User.objects.filter(id=user_id, is_active=True).first()
        if not assignee:
            return Response({"detail": "User not found."}, status=status.HTTP_400_BAD_REQUEST)
        if service_request.current_assignee_id is not None:
            return Response(
                {"detail": "This request is already assigned to someone."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        actor_role = get_primary_role_key(request.user)
        if (
            actor_role in {"manager", "team_leader"}
            and request.user.entity_id
            and request.user.entity.entity_type == Entity.EntityType.PROD
        ):
            return Response(
                {
                    "detail": "Assignment is only allowed for support/dev manager and team leader flows."
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        target_entity_id = get_request_target_entity_id(service_request)
        if actor_role in {"manager", "senior"}:
            is_team_leader = UserRole.objects.filter(
                user_id=assignee.id, role__key="team_leader"
            ).exists()
            if not is_team_leader:
                return Response(
                    {"detail": "Only Team Leaders can be assigned from this flow."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if actor_role == "senior" and assignee.id == request.user.id:
                return Response(
                    {
                        "detail": "Senior users cannot assign a request to themselves. Please choose a Team Leader from the target entity."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if (
                assignee.company_id != request.user.company_id
                or assignee.entity_id != target_entity_id
            ):
                return Response(
                    {
                        "detail": "Selected Team Leader must be in your company and in the request target entity."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif actor_role == "team_leader":
            if not can_tl_own_request(request.user, service_request):
                return Response(
                    {"detail": "You can only assign requests owned by your team."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            assignable_user_ids = set(
                get_tl_assignable_members_queryset(request.user, service_request).values_list(
                    "id", flat=True
                )
            )
            if assignee.id not in assignable_user_ids:
                return Response(
                    {
                        "detail": "Team leaders can only assign requests to regular members of their own team."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
        service_request.current_assignee = assignee
        service_request.save(update_fields=["current_assignee"])

        RequestAssignmentHistory.objects.create(
            request=service_request,
            assigned_by=request.user,
            assignee=assignee,
            note=note,
        )
        create_notification(
            user=assignee,
            event_type=UserNotification.EventType.REQUEST_MESSAGE,
            title=f"Request assigned: {service_request.request_number}",
            message=(
                f"{request.user.username} assigned you request "
                f"{service_request.request_number}."
            ),
            link=f"/requests/{service_request.id}",
            metadata={
                "request_id": service_request.id,
                "request_number": service_request.request_number,
            },
        )
        assignee_role_keys = set(get_user_role_keys(assignee))
        if "team_leader" in assignee_role_keys:
            mirror_request_assignment_to_telegram(
                service_request=service_request,
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
                {"detail": "You do not have permission to reassign this request target team."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RequestTargetReassignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target_team_value = serializer.validated_data["target_team"]
        selected_team = (
            Team.objects.select_related("leader", "entity")
            .filter(id=target_team_value, is_active=True)
            .first()
        )
        # Legacy compatibility: allow TL user id and map to that TL's active team.
        if selected_team is None:
            selected_tl = (
                User.objects.select_related("entity")
                .filter(id=target_team_value, is_active=True)
                .first()
            )
            if selected_tl:
                selected_team = (
                    Team.objects.select_related("leader", "entity")
                    .filter(leader_id=selected_tl.id, is_active=True)
                    .order_by("id")
                    .first()
                )
        if selected_team is None:
            return Response(
                {"detail": "Target team not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        selected_tl = selected_team.leader
        if selected_tl is None or not selected_tl.is_active:
            return Response(
                {"detail": "Selected team must have an active team leader."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        is_team_leader = UserRole.objects.filter(user_id=selected_tl.id, role__key="team_leader").exists()
        if not is_team_leader:
            return Response(
                {"detail": "Selected team leader must have Team Leader role."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not selected_team.entity_id or selected_team.entity.entity_type == Entity.EntityType.PROD:
            return Response(
                {"detail": "Selected team must belong to a support/dev entity."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request_company_id = get_request_company_id(service_request)
        if request_company_id and selected_team.company_id != request_company_id:
            return Response(
                {"detail": "Target team must belong to the same request company."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if is_company_scoped_manager(request.user) and selected_team.company_id != request.user.company_id:
            return Response(
                {"detail": "Seniors can only reassign requests inside their company."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if get_primary_role_key(request.user) == "manager" and selected_team.company_id != request.user.company_id:
            return Response(
                {"detail": "Managers can only reassign requests inside their company."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if get_primary_role_key(request.user) == "manager" and selected_team.entity_id != request.user.entity_id:
            return Response(
                {"detail": "Managers can only reassign requests to teams inside their entity."},
                status=status.HTTP_403_FORBIDDEN,
            )

        new_target_entity = selected_team.entity
        old_target_entity = (
            service_request.target_entity
            or Entity.objects.filter(code=service_request.target_unit.code).first()
        )
        if service_request.target_team_id and service_request.target_team_id == selected_team.id:
            return Response(
                {"detail": "Request is already assigned to this target team."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_unit = get_or_create_unit_for_entity(new_target_entity)
        service_request.target_team = selected_team
        service_request.target_entity = new_target_entity
        service_request.target_unit = target_unit
        service_request.target_team_leader = selected_tl
        service_request.current_assignee = None
        service_request.save(
            update_fields=[
                "target_team",
                "target_entity",
                "target_unit",
                "target_team_leader",
                "current_assignee",
            ]
        )
        RequestTeamReassignmentHistory.objects.create(
            request=service_request,
            old_target_entity=old_target_entity or new_target_entity,
            new_target_entity=new_target_entity,
            changed_by=request.user,
            note=serializer.validated_data.get("note", ""),
        )
        recipients = resolve_request_notification_recipients(service_request, exclude_user_id=request.user.id)
        create_bulk_notifications(
            users=filter_recipients_by_request_visibility(service_request, recipients),
            event_type=UserNotification.EventType.REQUEST_MESSAGE,
            title="Request reassigned to your team",
            message=f"Request {service_request.request_number} was reassigned to {selected_tl.username}'s team.",
            link=f"/requests/{service_request.id}",
            metadata={
                "request_id": service_request.id,
                "target_team_id": selected_team.id,
                "target_entity_id": new_target_entity.id,
                "target_team_leader_id": selected_tl.id,
            },
        )
        service_request = load_request(request_id)
        mark_request_stuck(service_request)
        return Response(
            RequestDetailSerializer(
                service_request,
                context=build_request_detail_context(request, service_request),
            ).data
        )


class RequestInviteMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, request_id):
        service_request = load_request(request_id)
        if service_request is None:
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        if not get_visible_requests_queryset(request.user).filter(id=service_request.id).exists():
            return Response({"detail": "You cannot access this request."}, status=status.HTTP_403_FORBIDDEN)
        if not can_invite_request_members(request.user, service_request):
            return Response(
                {"detail": "You do not have permission to invite members for this request."},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = get_request_invite_targets(service_request)
        payload["invited_members"] = get_request_invited_members(service_request)
        return Response(payload)

    def post(self, request, request_id):
        service_request = load_request(request_id)
        if service_request is None:
            return Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        if not get_visible_requests_queryset(request.user).filter(id=service_request.id).exists():
            return Response({"detail": "You cannot access this request."}, status=status.HTTP_403_FORBIDDEN)
        if not can_invite_request_members(request.user, service_request):
            return Response(
                {"detail": "You do not have permission to invite members for this request."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RequestInviteMembersSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        invite_targets = get_request_invite_targets(service_request)

        entity_ids = set(payload.get("entity_ids") or [])
        team_ids = set(payload.get("team_ids") or [])
        user_ids = set(payload.get("user_ids") or [])

        allowed_permissions = set(payload.get("permissions") or [])
        allowed_permissions.add("request.view")
        managed_permission_keys = [
            "request.view",
            "request.update_status",
            "request.comment",
            "request.view_discussion",
            "request.edit_deadline",
        ]

        selected_user_ids = set()
        if payload["invite_type"] == "entity":
            available_entity_ids = {item["id"] for item in invite_targets["entities"]}
            if not entity_ids.issubset(available_entity_ids):
                return Response({"detail": "Only support/dev entities can be invited."}, status=status.HTTP_400_BAD_REQUEST)
            selected_user_ids = {
                item["id"]
                for item in invite_targets["users"]
                if item.get("entity_id") in entity_ids
            }
        elif payload["invite_type"] == "team":
            available_team_ids = {item["id"] for item in invite_targets["teams"]}
            if not team_ids.issubset(available_team_ids):
                return Response({"detail": "Only teams from allowed support/dev entities can be invited."}, status=status.HTTP_400_BAD_REQUEST)
            selected_user_ids = {
                item["id"]
                for item in invite_targets["users"]
                if set(item.get("team_ids") or []).intersection(team_ids)
            }
        else:
            available_user_ids = {item["id"] for item in invite_targets["users"]}
            if not user_ids.issubset(available_user_ids):
                return Response({"detail": "Some selected users are outside the allowed target team scope."}, status=status.HTTP_400_BAD_REQUEST)
            selected_user_ids = set(user_ids)

        if not selected_user_ids:
            return Response({"detail": "No eligible users were found for the selected target."}, status=status.HTTP_400_BAD_REQUEST)

        # Notify only users that are newly invited in this action.
        previously_invited_user_ids = set(
            UserRequestPermissionOverride.objects.filter(
                user_id__in=selected_user_ids,
                request=service_request,
                permission_key="request.view",
                allowed=True,
            ).values_list("user_id", flat=True)
        )

        # Persist explicit allow/deny for all invite-managed keys so unchecked
        # permissions do not silently fall back to inherited role permissions.
        existing_overrides = UserRequestPermissionOverride.objects.filter(
            user_id__in=selected_user_ids,
            request=service_request,
            permission_key__in=managed_permission_keys,
        )
        existing_map = {
            (item.user_id, item.permission_key): item
            for item in existing_overrides
        }

        to_create = []
        to_update = []
        for user_id in sorted(selected_user_ids):
            for permission_key in managed_permission_keys:
                is_allowed = permission_key in allowed_permissions
                existing = existing_map.get((user_id, permission_key))
                if existing is None:
                    to_create.append(
                        UserRequestPermissionOverride(
                            user_id=user_id,
                            request=service_request,
                            permission_key=permission_key,
                            allowed=is_allowed,
                            created_by=request.user,
                        )
                    )
                elif bool(existing.allowed) != bool(is_allowed):
                    existing.allowed = is_allowed
                    to_update.append(existing)

        if to_create:
            UserRequestPermissionOverride.objects.bulk_create(to_create)
        if to_update:
            UserRequestPermissionOverride.objects.bulk_update(to_update, ["allowed", "updated_at"])

        newly_invited_user_ids = sorted(
            user_id for user_id in selected_user_ids
            if user_id not in previously_invited_user_ids and user_id != request.user.id
        )
        if newly_invited_user_ids:
            invited_users = User.objects.filter(id__in=newly_invited_user_ids, is_active=True)
            inviter_name = request.user.get_full_name() or request.user.username or "A manager"
            create_bulk_notifications(
                users=invited_users,
                event_type=UserNotification.EventType.GENERAL,
                title="You were invited to a request",
                message=(
                    f"{inviter_name} invited you to request "
                    f"{service_request.request_number or f'#{service_request.id}'}."
                ),
                link=f"/requests/{service_request.id}",
                metadata={
                    "request_id": service_request.id,
                    "request_number": service_request.request_number,
                    "invite_type": payload.get("invite_type"),
                },
            )

        service_request = load_request(request_id)
        return Response(
            RequestDetailSerializer(
                service_request,
                context=build_request_detail_context(request, service_request),
            ).data
        )


class RequestInvitedMemberManageView(APIView):
    permission_classes = [IsAuthenticated]

    managed_permission_keys = [
        "request.view",
        "request.update_status",
        "request.comment",
        "request.view_discussion",
        "request.edit_deadline",
    ]

    def _validate_access(self, request, request_id):
        service_request = load_request(request_id)
        if service_request is None:
            return None, Response({"detail": "Request not found."}, status=status.HTTP_404_NOT_FOUND)
        if not get_visible_requests_queryset(request.user).filter(id=service_request.id).exists():
            return None, Response({"detail": "You cannot access this request."}, status=status.HTTP_403_FORBIDDEN)
        if not can_invite_request_members(request.user, service_request):
            return None, Response({"detail": "You do not have permission to manage invited members."}, status=status.HTTP_403_FORBIDDEN)
        return service_request, None

    def patch(self, request, request_id, user_id):
        service_request, error_response = self._validate_access(request, request_id)
        if error_response:
            return error_response
        target_user = User.objects.filter(id=user_id, is_active=True).first()
        if not target_user:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        permissions = set(request.data.get("permissions") or [])
        valid_permissions = {
            "request.update_status",
            "request.comment",
            "request.view_discussion",
            "request.edit_deadline",
        }
        if not permissions.issubset(valid_permissions):
            return Response({"detail": "Invalid permissions payload."}, status=status.HTTP_400_BAD_REQUEST)
        permissions.add("request.view")

        existing = UserRequestPermissionOverride.objects.filter(
            user_id=target_user.id,
            request=service_request,
            permission_key__in=self.managed_permission_keys,
        )
        existing_map = {(item.user_id, item.permission_key): item for item in existing}
        to_create = []
        to_update = []
        for key in self.managed_permission_keys:
            allowed = key in permissions
            current = existing_map.get((target_user.id, key))
            if current is None:
                to_create.append(
                    UserRequestPermissionOverride(
                        user_id=target_user.id,
                        request=service_request,
                        permission_key=key,
                        allowed=allowed,
                        created_by=request.user,
                    )
                )
            elif bool(current.allowed) != bool(allowed):
                current.allowed = allowed
                to_update.append(current)
        if to_create:
            UserRequestPermissionOverride.objects.bulk_create(to_create)
        if to_update:
            UserRequestPermissionOverride.objects.bulk_update(to_update, ["allowed", "updated_at"])

        service_request = load_request(request_id)
        return Response(
            RequestDetailSerializer(
                service_request,
                context=build_request_detail_context(request, service_request),
            ).data
        )

    def delete(self, request, request_id, user_id):
        service_request, error_response = self._validate_access(request, request_id)
        if error_response:
            return error_response
        UserRequestPermissionOverride.objects.filter(
            user_id=user_id,
            request=service_request,
            permission_key__in=self.managed_permission_keys,
        ).delete()
        service_request = load_request(request_id)
        return Response(
            RequestDetailSerializer(
                service_request,
                context=build_request_detail_context(request, service_request),
            ).data
        )



def get_pending_approval_team_leaders(service_request, exclude_user_id=None):
    requester = service_request.requester_user
    company_id = get_request_company_id(service_request) or requester.company_id
    source_entity_id = service_request.source_entity_id or requester.entity_id

    approver_ids = UserRole.objects.filter(role__key__in=["team_leader", "manager"]).values_list(
        "user_id", flat=True
    )
    recipients = User.objects.filter(is_active=True, id__in=approver_ids)

    if company_id:
        recipients = recipients.filter(company_id=company_id)
    if source_entity_id:
        recipients = recipients.filter(entity_id=source_entity_id)

    if requester.team_leader_id:
        recipients = recipients | User.objects.filter(
            id=requester.team_leader_id,
            is_active=True,
        )

    if exclude_user_id:
        recipients = recipients.exclude(id=exclude_user_id)

    return recipients.distinct()
def load_request(request_id):
    return (
        ServiceRequest.objects.select_related(
            "company",
            "source_entity",
            "target_entity",
            "target_team_leader",
            "target_team",
            "target_team__leader",
            "target_team__entity",
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


def can_use_request_permission(user, service_request, permission_key, fallback_allowed):
    return apply_request_permission_override(
        user=user,
        service_request=service_request,
        permission_key=permission_key,
        fallback_allowed=fallback_allowed,
    )


def get_visible_requests_queryset(user, include_related=False, include_ordering=True):
    base_queryset = ServiceRequest.objects.all()
    if include_related:
        base_queryset = base_queryset.select_related(
            "company",
            "source_entity",
            "target_entity",
            "target_team",
            "target_team__leader",
            "target_team__entity",
            "target_unit",
            "requester_user",
            "requester_user__company",
            "requester_unit",
            "current_assignee",
        )
    if include_ordering:
        base_queryset = base_queryset.order_by("-created_at")

    effective_permissions = set(get_effective_permission_keys(user))
    visibility_filter = Q(pk__in=[])

    if "view_all_requests" in effective_permissions:
        visibility_filter |= Q()

    if "view_company_requests" in effective_permissions and user.company_id:
        visibility_filter |= (
            Q(company_id=user.company_id)
            | Q(company__isnull=True, requester_user__company_id=user.company_id)
        )

    # Keep manager routing visibility company-scoped when assignment permission exists.
    # This prevents reassigned requests from disappearing after refresh.
    if (
        get_primary_role_key(user) == "manager"
        and has_permission(user, "assign_request")
        and user.company_id
    ):
        visibility_filter |= (
            Q(company_id=user.company_id)
            | Q(company__isnull=True, requester_user__company_id=user.company_id)
        )

    if "view_entity_requests" in effective_permissions and user.entity_id:
        visibility_filter |= (
            Q(source_entity_id=user.entity_id)
            | Q(source_entity__isnull=True, requester_unit__code=user.entity.code)
            | Q(target_entity_id=user.entity_id)
            | Q(target_entity__isnull=True, target_unit__code=user.entity.code)
            | Q(requester_user__entity_id=user.entity_id)
        )

    if "view_team_requests" in effective_permissions:
        legacy_team_user_ids = set(
            user.__class__.objects.filter(team_leader_id=user.id).values_list("id", flat=True)
        )
        team_member_ids = set(
            Team.objects.filter(leader_id=user.id, is_active=True).values_list("members__id", flat=True)
        )
        team_user_ids = list(legacy_team_user_ids | team_member_ids)
        role_key = get_primary_role_key(user)
        if role_key == "team_leader":
            legacy_entity_fallback_q = (
                Q(target_entity_id=user.entity_id) if user.entity_id else Q(pk__in=[])
            )
            team_ownership_filter = (
                Q(target_team_id__isnull=False, target_team__leader_id=user.id)
                | Q(
                    target_team_id__isnull=True,
                    target_team_leader_id__isnull=False,
                    target_team_leader_id=user.id,
                )
                | (
                    Q(target_team_id__isnull=True, target_team_leader_id__isnull=True)
                    & legacy_entity_fallback_q
                )
            )
            visibility_filter |= (
                Q(requester_user_id=user.id)
                | Q(current_assignee_id=user.id)
                | Q(requester_user_id__in=team_user_ids)
                | Q(current_assignee_id__in=team_user_ids)
                | team_ownership_filter
            )
        else:
            visibility_filter |= (
                Q(requester_user_id=user.id)
                | Q(current_assignee_id=user.id)
                | Q(requester_user_id__in=team_user_ids)
                | Q(current_assignee_id__in=team_user_ids)
                | (
                    Q(target_entity_id=user.entity_id)
                    if user.entity_id
                    else Q(pk__in=[])
                )
            )

    if "view_own_requests" in effective_permissions:
        visibility_filter |= Q(requester_user_id=user.id) | Q(current_assignee_id=user.id)

    pending_visibility = get_pending_approval_visibility_filter(user)
    if get_primary_role_key(user) == "super_admin":
        role_scoped_queryset = base_queryset
    elif "view_all_requests" in effective_permissions:
        role_scoped_queryset = base_queryset.filter(
            Q(is_submitted_to_target=True) | pending_visibility,
        )
    else:
        role_scoped_queryset = base_queryset.filter(
            visibility_filter,
            Q(is_submitted_to_target=True) | pending_visibility,
        )

    view_overrides = UserRequestPermissionOverride.objects.filter(
        user=user,
        permission_key="request.view",
    )
    denied_request_ids = list(
        view_overrides.filter(allowed=False).values_list("request_id", flat=True)
    )
    allowed_request_ids = list(
        view_overrides.filter(allowed=True).values_list("request_id", flat=True)
    )

    if not denied_request_ids and not allowed_request_ids:
        return role_scoped_queryset

    return (
        base_queryset.filter(
            Q(id__in=role_scoped_queryset.values("id")) | Q(id__in=allowed_request_ids)
        )
        .exclude(id__in=denied_request_ids)
        .distinct()
    )


def can_manage_incoming_request(user, service_request):
    if not service_request.is_submitted_to_target:
        return False
    if not user.entity_id or user.entity.entity_type == Entity.EntityType.PROD:
        return False
    return (
        get_request_company_id(service_request) == user.company_id
        and get_request_target_entity_id(service_request) == user.entity_id
    )


def can_edit_request_deadline(user, service_request):
    has_base_permission = has_permission(user, "edit_request_deadline")
    actor_role = get_primary_role_key(user)
    if actor_role in {"super_admin", "senior"}:
        fallback_allowed = has_base_permission and can_operate_submitted_request(
            user, service_request
        )
    else:
        fallback_allowed = has_base_permission and can_manage_incoming_request(
            user, service_request
        )
    return can_use_request_permission(
        user,
        service_request,
        "request.edit_deadline",
        fallback_allowed,
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
    return has_permission(user, "view_all_requests")


def is_company_scoped_manager(user):
    return has_permission(user, "view_company_requests") and bool(user.company_id)


def can_update_request_status(user, service_request):
    fallback_allowed = bool(get_allowed_status_transitions(user, service_request))
    return can_use_request_permission(
        user,
        service_request,
        "request.update_status",
        fallback_allowed,
    )


def can_operate_submitted_request(user, service_request):
    if not service_request.is_submitted_to_target:
        return False
    if is_global_requests_manager(user):
        return True
    if is_company_scoped_manager(user):
        return get_request_company_id(service_request) == user.company_id
    return can_manage_incoming_request(user, service_request)


def can_pin_request_message(user, service_request):
    if not user or not service_request:
        return False
    # Request creator can pin discussion messages on their own request.
    if service_request.requester_user_id == user.id:
        return True
    # Assigned support/dev team members can pin.
    entity_type = str(getattr(getattr(user, "entity", None), "entity_type", "")).upper()
    if entity_type not in {"SUPPORT", "TDEV"}:
        return False
    if service_request.current_assignee_id == user.id:
        return True
    if service_request.target_team_id:
        if service_request.target_team and service_request.target_team.leader_id == user.id:
            return True
        if service_request.target_team and service_request.target_team.members.filter(id=user.id).exists():
            return True
        return False
    if service_request.target_team_leader_id and service_request.target_team_leader_id == user.id:
        return True
    target_entity_id = get_request_target_entity_id(service_request)
    return bool(target_entity_id and user.entity_id and target_entity_id == user.entity_id)


def get_allowed_status_transitions(user, service_request):
    # CLOSED is terminal: no further status transitions are allowed.
    if service_request.status == ServiceRequest.Status.CLOSED:
        return set()

    # Super admin should always be able to move request status in both
    # approval and submitted workflows, regardless of scoped permission drift.
    if get_primary_role_key(user) == "super_admin":
        if (
            service_request.status == ServiceRequest.Status.NEW
            and not service_request.is_submitted_to_target
        ):
            return {ServiceRequest.Status.ACCEPTED, ServiceRequest.Status.REJECTED}
        return {
            ServiceRequest.Status.ACCEPTED,
            ServiceRequest.Status.IN_PROGRESS,
            ServiceRequest.Status.REJECTED,
            ServiceRequest.Status.COMPLETED,
            ServiceRequest.Status.CLOSED,
        }

    allowed = set()
    if (
        service_request.status == ServiceRequest.Status.NEW
        and not service_request.is_submitted_to_target
    ):
        can_approve = can_use_request_permission(
            user,
            service_request,
            "request.approve",
            has_permission(user, "approve_request")
            and can_approve_request_from_requester_hierarchy(user, service_request),
        )
        if can_approve:
            return {ServiceRequest.Status.ACCEPTED, ServiceRequest.Status.REJECTED}
        return set()

    # Result validation by requester-side PROD approvers:
    # once target team marks COMPLETED, requester hierarchy can either
    # approve result (CLOSED) or reject result (back to IN_PROGRESS).
    if (
        service_request.status == ServiceRequest.Status.COMPLETED
        and can_validate_completed_result(user, service_request)
    ):
        return {ServiceRequest.Status.CLOSED, ServiceRequest.Status.IN_PROGRESS}

    can_update_status = can_use_request_permission(
        user,
        service_request,
        "request.update_status",
        has_permission(user, "resolve_request")
        and can_operate_submitted_request(user, service_request),
    )
    if not can_update_status:
        return set()

    allowed.update(
        {
            ServiceRequest.Status.ACCEPTED,
            ServiceRequest.Status.IN_PROGRESS,
            ServiceRequest.Status.REJECTED,
            ServiceRequest.Status.COMPLETED,
        }
    )
    # Target team cannot close requests directly.
    allowed.discard(ServiceRequest.Status.CLOSED)
    return allowed


def can_approve_request_from_requester_hierarchy(actor, service_request):
    def requester_managed_by_tl():
        if not actor or get_primary_role_key(actor) != "team_leader":
            return False
        requester = service_request.requester_user
        if not requester:
            return False
        if requester.id == actor.id:
            return True
        if requester.team_leader_id == actor.id:
            return True
        return Team.objects.filter(
            leader_id=actor.id,
            is_active=True,
            members__id=requester.id,
        ).exists()

    actor_role = get_primary_role_key(actor)
    requester = service_request.requester_user
    if actor_role == "super_admin":
        return True
    if actor_role == "senior":
        return bool(actor.company_id) and actor.company_id == requester.company_id
    if actor_role in {"manager", "senior"}:
        return (
            bool(actor.company_id)
            and bool(actor.entity_id)
            and actor.company_id == requester.company_id
            and actor.entity_id == requester.entity_id
        )
    if actor_role == "team_leader":
        return requester_managed_by_tl()
    return False


def can_validate_completed_result(actor, service_request):
    actor_role = get_primary_role_key(actor)
    requester = service_request.requester_user
    fallback_allowed = False
    if actor_role == "super_admin":
        fallback_allowed = True
    elif actor_role == "senior":
        fallback_allowed = (
            bool(actor.company_id) and actor.company_id == service_request.company_id
        )
    elif actor_role == "manager":
        fallback_allowed = (
            bool(actor.company_id)
            and bool(actor.entity_id)
            and actor.company_id == requester.company_id
            and actor.entity_id == requester.entity_id
        )
    elif actor_role == "team_leader":
        fallback_allowed = (
            requester.id == actor.id
            or requester.team_leader_id == actor.id
            or Team.objects.filter(
                leader_id=actor.id,
                is_active=True,
                members__id=requester.id,
            ).exists()
        )
    elif actor_role == "user":
        fallback_allowed = requester.id == actor.id

    # Explicitly block support/dev-side approval for completed-result validation
    # unless the actor is a valid requester-side approver above.
    if actor_role in {"manager", "team_leader"}:
        if not actor.entity_id or not actor.entity:
            fallback_allowed = fallback_allowed and False
        elif actor.entity.entity_type != Entity.EntityType.PROD:
            fallback_allowed = False
    return can_use_request_permission(
        actor,
        service_request,
        "request.approve",
        fallback_allowed,
    )


def get_pending_approval_visibility_filter(user):
    role_key = get_primary_role_key(user)
    if role_key == "super_admin":
        return Q()
    if not has_permission(user, "approve_request"):
        return Q(requester_user_id=user.id)
    if role_key in {"manager", "team_leader"} and not can_access_pending_scope(user):
        return Q(requester_user_id=user.id)
    if role_key == "senior":
        if not user.company_id:
            return Q(requester_user_id=user.id)
        return Q(requester_user__company_id=user.company_id)
    if role_key == "manager":
        if not user.company_id or not user.entity_id:
            return Q(requester_user_id=user.id)
        return Q(
            requester_user__company_id=user.company_id,
            requester_user__entity_id=user.entity_id,
        )
    if role_key == "team_leader":
        member_ids = list(
            Team.objects.filter(leader_id=user.id, is_active=True).values_list("members__id", flat=True)
        )
        return (
            Q(requester_user__team_leader_id=user.id)
            | Q(requester_user_id=user.id)
            | Q(requester_user_id__in=member_ids)
        )
    return Q(requester_user_id=user.id)


def can_reassign_target_team(user, service_request):
    if not has_permission(user, "assign_request"):
        return False
    role_key = get_primary_role_key(user)
    request_company_id = get_request_company_id(service_request)
    request_target_entity_id = get_request_target_entity_id(service_request)

    if role_key == "super_admin":
        return True
    if role_key == "senior":
        if is_global_requests_manager(user):
            return True
        if is_company_scoped_manager(user):
            return bool(request_company_id and user.company_id and request_company_id == user.company_id)
        return False
    if role_key == "manager":
        return bool(
            request_company_id
            and request_target_entity_id
            and user.company_id
            and user.entity_id
            and request_company_id == user.company_id
            and request_target_entity_id == user.entity_id
        )

    if is_global_requests_manager(user):
        return True
    if is_company_scoped_manager(user):
        return bool(request_company_id and request_company_id == user.company_id)
    return False


def build_request_detail_context(request, service_request):
    allowed_status_transitions = sorted(get_allowed_status_transitions(request.user, service_request))
    can_view_discussion = can_use_request_permission(
        request.user,
        service_request,
        "request.view_discussion",
        has_permission(request.user, "view_request_discussion"),
    )
    can_comment_request = can_use_request_permission(
        request.user,
        service_request,
        "request.comment",
        has_permission(request.user, "comment_request"),
    )
    can_pin_request_messages = can_pin_request_message(request.user, service_request)
    return {
        "request": request,
        "can_manage_incoming_request": bool(allowed_status_transitions),
        "can_edit_deadline": can_edit_request_deadline(request.user, service_request),
        "can_invite_members": can_invite_request_members(request.user, service_request),
        "allowed_status_transitions": allowed_status_transitions,
        "can_assign_request": can_assign_request(request.user, service_request),
        "can_reassign_target_team": can_reassign_target_team(request.user, service_request),
        "can_view_request_discussion": can_view_discussion,
        "can_comment_request": can_comment_request,
        "can_pin_request_messages": can_pin_request_messages,
        "available_reassignment_targets": get_available_reassignment_targets(
            request.user, service_request
        ),
        "potential_assignees": get_potential_assignees(request.user, service_request),
        "invited_members": get_request_invited_members(service_request),
    }


def get_potential_assignees(user, service_request):
    if not can_assign_request(user, service_request):
        return []
    target_entity_id = get_request_target_entity_id(service_request)
    if not target_entity_id:
        return []

    queryset = User.objects.filter(entity_id=target_entity_id, is_active=True).order_by(
        "username"
    )
    actor_role = get_primary_role_key(user)
    if actor_role in {"manager", "senior"}:
        queryset = queryset.filter(
            id__in=UserRole.objects.filter(role__key="team_leader").values_list(
                "user_id", flat=True
            )
        )
        if actor_role == "senior":
            queryset = queryset.exclude(id=user.id)
    elif actor_role == "team_leader":
        queryset = get_tl_assignable_members_queryset(user, service_request)

    return [
        {
            "id": u.id,
            "username": u.username,
            "role_keys": get_user_role_keys(u),
        }
        for u in queryset
    ]


def can_tl_own_request(user, service_request):
    if get_primary_role_key(user) != "team_leader":
        return False
    if service_request.target_team_id:
        return bool(
            service_request.target_team
            and service_request.target_team.leader_id == user.id
        )
    if service_request.target_team_leader_id:
        return service_request.target_team_leader_id == user.id
    return bool(user.entity_id and service_request.target_entity_id == user.entity_id)


def get_tl_assignable_members_queryset(user, service_request):
    if get_primary_role_key(user) != "team_leader":
        return User.objects.none()

    # Resolve candidate member source in order:
    # 1) request.target_team.members
    # 2) TL active led team members
    # 3) legacy users linked by User.team_leader
    candidate_ids = []
    request_team = service_request.target_team if service_request.target_team_id else None
    if request_team and request_team.leader_id == user.id:
        candidate_ids = list(request_team.members.values_list("id", flat=True))
        if not candidate_ids:
            active_led_team = (
                Team.objects.filter(leader_id=user.id, is_active=True).order_by("id").first()
            )
            if active_led_team:
                candidate_ids = list(active_led_team.members.values_list("id", flat=True))
    elif service_request.target_team_leader_id == user.id:
        candidate_ids = list(
            User.objects.filter(team_leader_id=user.id, is_active=True).values_list("id", flat=True)
        )
    elif not service_request.target_team_id and not service_request.target_team_leader_id:
        # Legacy entity-only request fallback.
        candidate_ids = list(
            User.objects.filter(team_leader_id=user.id, is_active=True).values_list("id", flat=True)
        )

    if not candidate_ids:
        return User.objects.none()

    regular_user_ids = set(
        UserRole.objects.filter(role__key="user").values_list("user_id", flat=True)
    )
    forbidden_role_user_ids = set(
        UserRole.objects.filter(
            role__key__in=["team_leader", "manager", "senior", "super_admin"]
        ).values_list("user_id", flat=True)
    )
    allowed_ids = [
        user_id
        for user_id in candidate_ids
        if user_id in regular_user_ids and user_id not in forbidden_role_user_ids and user_id != user.id
    ]
    if not allowed_ids:
        return User.objects.none()

    return (
        User.objects.select_related("entity")
        .filter(
            id__in=allowed_ids,
            is_active=True,
            company_id=user.company_id,
            entity_id=user.entity_id,
        )
        .exclude(entity__entity_type=Entity.EntityType.PROD)
        .distinct()
        .order_by("username")
    )


def get_available_reassignment_targets(user, service_request):
    if not can_reassign_target_team(user, service_request):
        return []

    request_company_id = get_request_company_id(service_request)
    if request_company_id is None:
        return []

    team_leader_ids = set(
        UserRole.objects.filter(role__key="team_leader").values_list("user_id", flat=True)
    )
    queryset = (
        Team.objects.select_related("leader", "entity")
        .filter(
            is_active=True,
            company_id=request_company_id,
            leader__isnull=False,
            leader__is_active=True,
            entity__is_active=True,
        )
        .exclude(entity__entity_type=Entity.EntityType.PROD)
        .order_by("name")
    )
    if get_primary_role_key(user) == "manager" and user.entity_id:
        queryset = queryset.filter(entity_id=user.entity_id)
    return [
        {
            "id": team.id,
            "name": team.name,
            "leader_id": team.leader_id,
            "leader_name": team.leader.username if team.leader_id else "",
            "team_leader_name": team.leader.username if team.leader_id else "",
            "entity_id": team.entity_id,
            "entity_name": team.entity.name if team.entity_id else "",
            "label": f"{team.name} — {team.entity.name if team.entity_id else 'Unknown Entity'}",
        }
        for team in queryset
        if team.leader_id in team_leader_ids
    ]


def can_invite_request_members(user, service_request):
    actor_role = get_primary_role_key(user)
    target_entity_id = get_request_target_entity_id(service_request)
    if not target_entity_id:
        return False
    if actor_role == "manager":
        return bool(user.entity_id and user.entity_id == target_entity_id)
    if service_request.target_team_id:
        is_member = Team.objects.filter(
            id=service_request.target_team_id,
            is_active=True,
        ).filter(Q(leader_id=user.id) | Q(members__id=user.id)).exists()
        return bool(is_member)
    if service_request.target_team_leader_id:
        if service_request.target_team_leader_id == user.id:
            return True
        return Team.objects.filter(
            leader_id=service_request.target_team_leader_id,
            is_active=True,
            members__id=user.id,
        ).exists()
    return False


def get_request_invite_targets(service_request):
    request_company_id = get_request_company_id(service_request)
    if not request_company_id:
        return {"entities": [], "teams": [], "users": []}
    request_target_entity_id = get_request_target_entity_id(service_request)

    allowed_entities = list(
        Entity.objects.filter(
            company_id=request_company_id,
            is_active=True,
            entity_type__in=[Entity.EntityType.SUPPORT, Entity.EntityType.TDEV],
        ).order_by("name")
    )
    if request_target_entity_id:
        allowed_entities = [
            entity for entity in allowed_entities if entity.id != request_target_entity_id
        ]
    if not allowed_entities:
        return {"entities": [], "teams": [], "users": []}
    allowed_entity_ids = [entity.id for entity in allowed_entities]

    teams = list(
        Team.objects.select_related("leader")
        .filter(entity_id__in=allowed_entity_ids, is_active=True)
        .order_by("name")
    )
    team_member_map = {}
    for team in teams:
        member_ids = list(team.members.values_list("id", flat=True))
        if team.leader_id and team.leader_id not in member_ids:
            member_ids.append(team.leader_id)
        team_member_map[team.id] = set(member_ids)

    users = (
        User.objects.filter(
            is_active=True,
            entity_id__in=allowed_entity_ids,
            id__in=sorted({uid for values in team_member_map.values() for uid in values}),
        )
        .order_by("username")
    )
    role_map = {}
    for item in UserRole.objects.filter(user_id__in=users.values_list("id", flat=True)).select_related("role"):
        role_map.setdefault(item.user_id, set()).add(item.role.key)

    users_payload = []
    for usr in users:
        user_team_ids = [team_id for team_id, member_ids in team_member_map.items() if usr.id in member_ids]
        users_payload.append(
            {
                "id": usr.id,
                "username": usr.username,
                "entity_id": usr.entity_id,
                "team_id": user_team_ids[0] if user_team_ids else None,
                "team_ids": user_team_ids,
                "role_keys": sorted(list(role_map.get(usr.id, set()))),
            }
        )

    return {
        "entities": [
            {
                "id": entity.id,
                "name": entity.name,
                "entity_type": entity.entity_type,
            }
            for entity in allowed_entities
        ],
        "teams": [
            {
                "id": team.id,
                "name": team.name,
                "entity_id": team.entity_id,
                "entity_type": team.entity.entity_type if team.entity_id and team.entity else "",
                "leader_id": team.leader_id,
                "leader_name": team.leader.username if team.leader_id and team.leader else "",
            }
            for team in teams
        ],
        "users": users_payload,
    }


def get_request_invited_members(service_request):
    managed_permission_keys = [
        "request.view",
        "request.update_status",
        "request.comment",
        "request.view_discussion",
        "request.edit_deadline",
    ]
    overrides = UserRequestPermissionOverride.objects.filter(
        request=service_request,
        permission_key__in=managed_permission_keys,
    ).select_related("user", "user__entity")

    by_user = {}
    for item in overrides:
        if not item.user_id or not item.user or not item.user.is_active:
            continue
        entry = by_user.setdefault(
            item.user_id,
            {
                "id": item.user_id,
                "username": item.user.username,
                "entity_id": item.user.entity_id,
                "entity_name": item.user.entity.name if item.user.entity_id and item.user.entity else "",
                "permissions": {},
            },
        )
        entry["permissions"][item.permission_key] = bool(item.allowed)

    result = []
    for _, entry in by_user.items():
        if not entry["permissions"].get("request.view", False):
            continue
        result.append(
            {
                "id": entry["id"],
                "username": entry["username"],
                "entity_id": entry["entity_id"],
                "entity_name": entry["entity_name"],
                "permissions": {
                    "request.update_status": bool(entry["permissions"].get("request.update_status", False)),
                    "request.comment": bool(entry["permissions"].get("request.comment", False)),
                    "request.view_discussion": bool(entry["permissions"].get("request.view_discussion", False)),
                    "request.edit_deadline": bool(entry["permissions"].get("request.edit_deadline", False)),
                },
            }
        )
    return sorted(result, key=lambda item: item["username"].lower())


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

    assignee = (params.get("assignee") or "").strip()
    if assignee:
        if assignee.lower() in {"unassigned", "none", "null"}:
            queryset = queryset.filter(current_assignee__isnull=True)
        elif assignee.isdigit():
            queryset = queryset.filter(current_assignee_id=assignee)
        else:
            queryset = queryset.filter(current_assignee__username__iexact=assignee)

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


def apply_scope_filters(queryset, user, scope):
    normalized_scope = (scope or "").strip().lower()
    role_key = get_primary_role_key(user)
    if normalized_scope == "mine":
        if not has_permission(user, "view_own_requests"):
            return queryset.none()
        return queryset.filter(requester_user_id=user.id)
    if normalized_scope == "pending":
        if role_key == "super_admin":
            return queryset.filter(
                is_submitted_to_target=False,
                status=ServiceRequest.Status.NEW,
            )
        if role_key == "user" and has_permission(user, "approve_request"):
            return queryset.none()
        if has_permission(user, "approve_request") and can_access_pending_scope(user):
            return queryset.filter(
                is_submitted_to_target=False,
                status=ServiceRequest.Status.NEW,
            )
        if has_permission(user, "view_own_requests"):
            # Users track their own pending and rejected approval decisions here.
            return queryset.filter(requester_user_id=user.id, is_submitted_to_target=False)
        if not can_access_pending_scope(user):
            return queryset.none()
        return queryset.none()
    # Operational/request-list scopes should only contain requests that were
    # submitted to target teams. This also covers the default "/requests"
    # case where scope is empty.
    if normalized_scope in {"", "team", "entity", "company", "team-all", "all"}:
        explicitly_allowed_ids = list(
            UserRequestPermissionOverride.objects.filter(
                user=user,
                permission_key="request.view",
                allowed=True,
            ).values_list("request_id", flat=True)
        )
        return queryset.filter(
            Q(is_submitted_to_target=True) | Q(id__in=explicitly_allowed_ids)
        )
    return queryset


def can_access_pending_scope(user):
    if get_primary_role_key(user) == "super_admin":
        return True
    if has_permission(user, "approve_request"):
        role_key = get_primary_role_key(user)
        if role_key in {"super_admin", "senior"}:
            return True
        if role_key in {"manager", "team_leader"}:
            return bool(
                user.entity_id and user.entity and user.entity.entity_type == Entity.EntityType.PROD
            )
    if has_permission(user, "view_own_requests") and can_create_requests(user):
        # Normal users can track their own pending decisions.
        return True
    return False


def can_assign_request(user, service_request):
    fallback_allowed = has_permission(user, "assign_request")
    fallback_allowed = fallback_allowed and service_request.is_submitted_to_target
    fallback_allowed = fallback_allowed and can_operate_submitted_request(
        user, service_request
    )
    actor_role = get_primary_role_key(user)
    if actor_role in {"manager", "team_leader"}:
        if not user.entity_id or user.entity.entity_type == Entity.EntityType.PROD:
            fallback_allowed = False
    if actor_role == "team_leader" and not can_tl_own_request(user, service_request):
        fallback_allowed = False
    return can_use_request_permission(
        user, service_request, "request.assign", fallback_allowed
    )


def filter_recipients_by_request_visibility(service_request, recipients_queryset):
    visible_ids = []
    for candidate in recipients_queryset:
        if get_visible_requests_queryset(candidate).filter(id=service_request.id).exists():
            visible_ids.append(candidate.id)
    if not visible_ids:
        return User.objects.none()
    return User.objects.filter(id__in=visible_ids, is_active=True)


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
