import json
import logging
import mimetypes
import os
import uuid
from urllib import parse, request

from django.conf import settings

logger = logging.getLogger(__name__)

TELEGRAM_MAX_MESSAGE_LEN = 4096


def mirror_request_created_to_telegram(service_request):
    if not getattr(settings, "TELEGRAM_MESSAGE_MIRROR_ENABLED", True):
        return
    bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", "").strip()
    if not bot_token:
        logger.info("Telegram mirror skipped: TELEGRAM_BOT_TOKEN not set.")
        return

    chat_id = _resolve_chat_id(service_request)
    if not chat_id:
        logger.info(
            "Telegram mirror skipped: no chat id configured for request %s.",
            service_request.request_number,
        )
        return

    source_name = (
        service_request.source_entity.name
        if service_request.source_entity_id
        else service_request.requester_unit.name
    )
    target_name = (
        service_request.target_entity.name
        if service_request.target_entity_id
        else service_request.target_unit.name
    )
    company_name = (
        service_request.company.name
        if service_request.company_id
        else (
            service_request.requester_user.company.name
            if service_request.requester_user.company_id
            else "-"
        )
    )
    approval_state = (
        "Submitted to target team"
        if service_request.is_submitted_to_target
        else "Pending approval"
    )

    text = (
        f"New request created\n"
        f"Company: {company_name}\n"
        f"Request: {service_request.request_number} | {service_request.title}\n"
        f"From: {source_name}\n"
        f"To: {target_name}\n"
        f"By: {service_request.requester_user.username}\n"
        f"Type: {service_request.category}\n"
        f"State: {approval_state}\n"
        f"Description: {service_request.description}"
    )
    if len(text) > TELEGRAM_MAX_MESSAGE_LEN:
        text = text[: TELEGRAM_MAX_MESSAGE_LEN - 3] + "..."

    _send_telegram_message(service_request, bot_token, chat_id, text)


def mirror_request_assignment_to_telegram(service_request, assigned_by, assignee, note=""):
    if not getattr(settings, "TELEGRAM_MESSAGE_MIRROR_ENABLED", True):
        return
    bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", "").strip()
    if not bot_token:
        logger.info("Telegram mirror skipped: TELEGRAM_BOT_TOKEN not set.")
        return

    chat_id = _resolve_chat_id(service_request)
    if not chat_id:
        logger.info(
            "Telegram mirror skipped: no chat id configured for request %s.",
            service_request.request_number,
        )
        return

    source_name = (
        service_request.source_entity.name
        if service_request.source_entity_id
        else service_request.requester_unit.name
    )
    target_name = (
        service_request.target_entity.name
        if service_request.target_entity_id
        else service_request.target_unit.name
    )
    company_name = (
        service_request.company.name
        if service_request.company_id
        else (
            service_request.requester_user.company.name
            if service_request.requester_user.company_id
            else "-"
        )
    )

    text = (
        f"Request assignment update\n"
        f"Company: {company_name}\n"
        f"Request: {service_request.request_number} | {service_request.title}\n"
        f"From: {source_name}\n"
        f"To: {target_name}\n"
        f"Assigned by: {assigned_by.username}\n"
        f"Assigned to: {assignee.username}\n"
        f"Note: {note or '-'}"
    )
    if len(text) > TELEGRAM_MAX_MESSAGE_LEN:
        text = text[: TELEGRAM_MAX_MESSAGE_LEN - 3] + "..."

    _send_telegram_message(service_request, bot_token, chat_id, text)


def mirror_request_message_to_telegram(service_request, request_message):
    if not getattr(settings, "TELEGRAM_MESSAGE_MIRROR_ENABLED", True):
        return
    bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", "").strip()
    if not bot_token:
        logger.info("Telegram mirror skipped: TELEGRAM_BOT_TOKEN not set.")
        return

    chat_id = _resolve_chat_id(service_request)
    if not chat_id:
        logger.info(
            "Telegram mirror skipped: no chat id configured for request %s.",
            service_request.request_number,
        )
        return

    source_name = (
        service_request.source_entity.name
        if service_request.source_entity_id
        else service_request.requester_unit.name
    )
    target_name = (
        service_request.target_entity.name
        if service_request.target_entity_id
        else service_request.target_unit.name
    )
    company_name = (
        service_request.company.name
        if service_request.company_id
        else (
            service_request.requester_user.company.name
            if service_request.requester_user.company_id
            else "-"
        )
    )

    text = (
        f"Request discussion update\n"
        f"Company: {company_name}\n"
        f"Request: {service_request.request_number} | {service_request.title}\n"
        f"From: {source_name}\n"
        f"To: {target_name}\n"
        f"By: {request_message.sender.username}\n"
        f"Message: {request_message.message}"
    )
    if len(text) > TELEGRAM_MAX_MESSAGE_LEN:
        text = text[: TELEGRAM_MAX_MESSAGE_LEN - 3] + "..."

    _send_telegram_message(service_request, bot_token, chat_id, text)
    _send_telegram_attachment(service_request, bot_token, chat_id, request_message)


def _send_telegram_message(service_request, bot_token, chat_id, text):
    payload = parse.urlencode(
        {
            "chat_id": chat_id,
            "text": text,
            "disable_web_page_preview": "true",
        }
    ).encode("utf-8")
    endpoint = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    req = request.Request(endpoint, data=payload, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with request.urlopen(req, timeout=8) as response:
            body = response.read().decode("utf-8", errors="ignore")
            parsed = json.loads(body) if body else {}
            if not parsed.get("ok", False):
                logger.warning(
                    "Telegram mirror failed for %s: %s",
                    service_request.request_number,
                    parsed,
                )
    except Exception as exc:
        logger.warning(
            "Telegram mirror exception for %s: %s",
            service_request.request_number,
            exc,
        )


def _send_telegram_attachment(service_request, bot_token, chat_id, request_message):
    attachment = getattr(request_message, "attachment", None)
    if not attachment:
        return

    try:
        file_path = attachment.path
    except Exception:
        logger.warning(
            "Telegram attachment mirror skipped for %s: attachment path unavailable.",
            service_request.request_number,
        )
        return

    if not file_path or not os.path.exists(file_path):
        logger.warning(
            "Telegram attachment mirror skipped for %s: file not found at %s.",
            service_request.request_number,
            file_path,
        )
        return

    file_name = os.path.basename(file_path)
    guessed_type, _ = mimetypes.guess_type(file_name)
    is_image = bool(guessed_type and guessed_type.startswith("image/"))

    caption = (
        f"Attachment on {service_request.request_number}\n"
        f"By: {request_message.sender.username}\n"
        f"File: {file_name}"
    )
    if len(caption) > 1024:
        caption = caption[:1021] + "..."

    endpoint = (
        f"https://api.telegram.org/bot{bot_token}/sendPhoto"
        if is_image
        else f"https://api.telegram.org/bot{bot_token}/sendDocument"
    )
    field_name = "photo" if is_image else "document"

    try:
        with open(file_path, "rb") as file_handle:
            file_bytes = file_handle.read()

        boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
        body = _build_multipart_body(
            boundary=boundary,
            fields={"chat_id": str(chat_id), "caption": caption},
            files=[
                {
                    "field_name": field_name,
                    "filename": file_name,
                    "content_type": guessed_type or "application/octet-stream",
                    "content": file_bytes,
                }
            ],
        )

        req = request.Request(endpoint, data=body, method="POST")
        req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        with request.urlopen(req, timeout=15) as response:
            raw_body = response.read().decode("utf-8", errors="ignore")
            parsed = json.loads(raw_body) if raw_body else {}
            if not parsed.get("ok", False):
                logger.warning(
                    "Telegram attachment mirror failed for %s: %s",
                    service_request.request_number,
                    parsed,
                )
    except Exception as exc:
        logger.warning(
            "Telegram attachment mirror exception for %s: %s",
            service_request.request_number,
            exc,
        )


def _build_multipart_body(boundary, fields, files):
    chunks = []
    boundary_bytes = boundary.encode("utf-8")

    for name, value in (fields or {}).items():
        chunks.append(b"--" + boundary_bytes + b"\r\n")
        chunks.append(
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8")
        )
        chunks.append(str(value).encode("utf-8"))
        chunks.append(b"\r\n")

    for file_info in (files or []):
        chunks.append(b"--" + boundary_bytes + b"\r\n")
        chunks.append(
            (
                f'Content-Disposition: form-data; name="{file_info["field_name"]}"; '
                f'filename="{file_info["filename"]}"\r\n'
            ).encode("utf-8")
        )
        chunks.append(
            f'Content-Type: {file_info["content_type"]}\r\n\r\n'.encode("utf-8")
        )
        chunks.append(file_info["content"])
        chunks.append(b"\r\n")

    chunks.append(b"--" + boundary_bytes + b"--\r\n")
    return b"".join(chunks)


def _resolve_chat_id(service_request):
    if service_request.company_id and service_request.company.telegram_group_chat_id:
        return service_request.company.telegram_group_chat_id
    if (
        service_request.requester_user.company_id
        and service_request.requester_user.company.telegram_group_chat_id
    ):
        return service_request.requester_user.company.telegram_group_chat_id
    if service_request.target_unit.telegram_chat_id:
        return service_request.target_unit.telegram_chat_id
    if service_request.requester_unit.telegram_chat_id:
        return service_request.requester_unit.telegram_chat_id
    return ""
