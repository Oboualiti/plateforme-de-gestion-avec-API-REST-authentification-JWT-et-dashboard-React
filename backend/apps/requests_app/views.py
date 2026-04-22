import json
import os
import re
from urllib import error as urllib_error
from urllib import request as urllib_request
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
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
    resolve_request_notification_recipients,
)
from apps.permissions_app.models import UserRole
from apps.permissions_app.services import (
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
    REQUEST_TYPE_CHOICES,
    RequestAssignUserSerializer,
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
        model = model_name or self._read_env_value("OPENROUTER_MODEL") or "nvidia/nemotron-3-super-120b-a12b:free"
        endpoint = "https://openrouter.ai/api/v1/chat/completions"

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
            if not text:
                text = "No response text returned from OpenRouter."
            return text
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
            raise RuntimeError(detail) from exc
        except (urllib_error.URLError, TimeoutError):
            raise RuntimeError("OpenRouter service is unreachable right now.")


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


class RequestListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = get_visible_requests_queryset(request.user)
        queryset = apply_scope_filters(queryset, request.user, request.query_params.get("scope"))
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
        submit_to_target_now = requester_primary_role != "user"

        service_request = ServiceRequest.objects.create(
            request_number=f"REQ-{timezone.now():%Y%m%d%H%M%S%f}",
            title=serializer.validated_data["title"],
            description=serializer.validated_data.get("description", ""),
            attachment=serializer.validated_data.get("attachment"),
            category=serializer.validated_data["type"],
            requester_user=request.user,
            company=selected_company,
            source_entity=selected_source_entity,
            target_entity=target_entity,
            requester_unit=requester_unit,
            target_unit=target_unit,
            is_submitted_to_target=submit_to_target_now,
        )
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
        serializer = RequestCommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_message = RequestMessage.objects.create(
            request=service_request,
            sender=request.user,
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
        elif service_request.current_assignee_id is None:
            service_request.current_assignee = request.user
            update_fields.append("current_assignee")
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
        if effective_new_status == ServiceRequest.Status.CLOSED:
            service_request.closed_at = timezone.now()
            service_request.resolution_note = note
            update_fields.extend(["closed_at", "resolution_note"])
        if effective_new_status == ServiceRequest.Status.REJECTED:
            service_request.rejection_reason = note
            service_request.resolution_note = note
            update_fields.extend(["rejection_reason", "resolution_note"])
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
        recipients = resolve_request_notification_recipients(service_request)
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
        if submit_to_target_on_approve:
            recipients = resolve_request_notification_recipients(service_request)
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
        if actor_role == "manager":
            is_team_leader = UserRole.objects.filter(
                user_id=assignee.id, role__key="team_leader"
            ).exists()
            if not is_team_leader:
                return Response(
                    {"detail": "Manager can assign requests only to Team Leaders."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if (
                assignee.company_id != request.user.company_id
                or assignee.entity_id != target_entity_id
            ):
                return Response(
                    {
                        "detail": "Selected Team Leader must be in the same company and target entity."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif actor_role == "team_leader" and assignee.id != request.user.id:
            return Response(
                {"detail": "Team Leader can only take request for self."},
                status=status.HTTP_403_FORBIDDEN,
            )
        elif actor_role == "handler" and assignee.id != request.user.id:
            return Response(
                {"detail": "Handler can only assign request to self."},
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

    effective_permissions = set(get_effective_permission_keys(user))
    visibility_filter = Q(pk__in=[])

    if "view_all_requests" in effective_permissions:
        visibility_filter |= Q()

    if "view_company_requests" in effective_permissions and user.company_id:
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
        team_user_ids = list(
            user.__class__.objects.filter(team_leader_id=user.id).values_list("id", flat=True)
        )
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
    return base_queryset.filter(visibility_filter, Q(is_submitted_to_target=True) | pending_visibility).distinct()


def can_manage_incoming_request(user, service_request):
    if not service_request.is_submitted_to_target:
        return False
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
    return has_permission(user, "view_all_requests")


def is_company_scoped_manager(user):
    return has_permission(user, "view_company_requests") and bool(user.company_id)


def can_update_request_status(user, service_request):
    return bool(get_allowed_status_transitions(user, service_request))


def can_operate_submitted_request(user, service_request):
    if not service_request.is_submitted_to_target:
        return False
    if is_global_requests_manager(user):
        return True
    if is_company_scoped_manager(user):
        return get_request_company_id(service_request) == user.company_id
    return can_manage_incoming_request(user, service_request)


def get_allowed_status_transitions(user, service_request):
    allowed = set()
    if (
        service_request.status == ServiceRequest.Status.NEW
        and not service_request.is_submitted_to_target
    ):
        if has_permission(user, "approve_request") and can_approve_request_from_requester_hierarchy(
            user, service_request
        ):
            return {ServiceRequest.Status.ACCEPTED, ServiceRequest.Status.REJECTED}
        return set()

    if not can_operate_submitted_request(user, service_request):
        return set()

    if has_permission(user, "approve_request"):
        allowed.update(
            {
                ServiceRequest.Status.ACCEPTED,
                ServiceRequest.Status.IN_PROGRESS,
                ServiceRequest.Status.REJECTED,
            }
        )
    if has_permission(user, "resolve_request"):
        allowed.add(ServiceRequest.Status.COMPLETED)
    if has_permission(user, "close_request"):
        allowed.add(ServiceRequest.Status.CLOSED)
    return allowed


def can_approve_request_from_requester_hierarchy(actor, service_request):
    actor_role = get_primary_role_key(actor)
    requester = service_request.requester_user

    if not has_permission(actor, "approve_request"):
        return False
    if actor_role == "super_admin":
        return True
    if actor_role == "senior":
        return bool(actor.company_id) and actor.company_id == requester.company_id
    if actor_role == "manager":
        return (
            bool(actor.company_id)
            and bool(actor.entity_id)
            and actor.company_id == requester.company_id
            and actor.entity_id == requester.entity_id
        )
    if actor_role == "team_leader":
        return requester.team_leader_id == actor.id
    return False


def get_pending_approval_visibility_filter(user):
    role_key = get_primary_role_key(user)
    if not has_permission(user, "approve_request"):
        return Q(requester_user_id=user.id)
    if role_key in {"manager", "team_leader"} and not can_access_pending_scope(user):
        return Q(requester_user_id=user.id)
    if role_key == "super_admin":
        return Q()
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
        return Q(requester_user__team_leader_id=user.id) | Q(requester_user_id=user.id)
    return Q(requester_user_id=user.id)


def can_reassign_target_team(user, service_request):
    if not has_permission(user, "assign_request"):
        return False
    if is_global_requests_manager(user):
        return True
    if is_company_scoped_manager(user):
        return get_request_company_id(service_request) == user.company_id
    return False


def build_request_detail_context(request, service_request):
    allowed_status_transitions = sorted(get_allowed_status_transitions(request.user, service_request))
    return {
        "request": request,
        "can_manage_incoming_request": bool(allowed_status_transitions),
        "allowed_status_transitions": allowed_status_transitions,
        "can_assign_request": can_assign_request(request.user, service_request),
        "can_reassign_target_team": can_reassign_target_team(request.user, service_request),
        "available_reassignment_targets": get_available_reassignment_targets(
            request.user, service_request
        ),
        "potential_assignees": get_potential_assignees(request.user, service_request),
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
    if actor_role == "manager":
        queryset = queryset.filter(
            id__in=UserRole.objects.filter(role__key="team_leader").values_list(
                "user_id", flat=True
            )
        )
    elif actor_role == "team_leader":
        queryset = queryset.filter(id=user.id)

    return [
        {
            "id": u.id,
            "username": u.username,
            "role_keys": get_user_role_keys(u),
        }
        for u in queryset
    ]


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


def apply_scope_filters(queryset, user, scope):
    normalized_scope = (scope or "").strip().lower()
    if normalized_scope == "mine":
        if not has_permission(user, "view_own_requests"):
            return queryset.none()
        return queryset.filter(requester_user_id=user.id)
    if normalized_scope == "pending":
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
        return queryset.filter(is_submitted_to_target=True)
    return queryset


def can_access_pending_scope(user):
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
    if not has_permission(user, "assign_request"):
        return False
    if not service_request.is_submitted_to_target:
        return False
    if not can_operate_submitted_request(user, service_request):
        return False
    actor_role = get_primary_role_key(user)
    if actor_role in {"manager", "team_leader"}:
        if not user.entity_id or user.entity.entity_type == Entity.EntityType.PROD:
            return False
    return True


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
