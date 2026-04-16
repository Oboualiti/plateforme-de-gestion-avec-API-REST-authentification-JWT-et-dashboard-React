from apps.audit_logs.models import AdminAuditLog


def log_admin_action(
    *,
    actor,
    module,
    action,
    target_model="",
    target_id="",
    target_label="",
    metadata=None,
):
    if actor is None or not getattr(actor, "is_authenticated", False):
        return
    AdminAuditLog.objects.create(
        actor=actor,
        module=module,
        action=action,
        target_model=target_model,
        target_id=str(target_id or ""),
        target_label=target_label or "",
        metadata=metadata or {},
    )
