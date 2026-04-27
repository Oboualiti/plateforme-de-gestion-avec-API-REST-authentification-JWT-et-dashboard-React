import json
import logging
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
