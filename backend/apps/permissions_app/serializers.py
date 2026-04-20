from rest_framework import serializers

from apps.permissions_app.models import AppPermission, UserPermissionOverride, UserRole
from apps.companies.models import Company
from apps.notifications.models import UserNotification
from apps.notifications.services import create_notification
from apps.roles.models import Role
from apps.users.models import User
from apps.entities.models import Entity

from .services import (
    ROLE_HIERARCHY,
    get_effective_permission_keys,
    get_primary_role_key,
    get_permission_matrix_for_user,
)


class RoleSummarySerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField()
    level = serializers.IntegerField()


class ManageableUserListSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    max_role_level = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True)
    entity_name = serializers.CharField(source="entity.name", read_only=True)
    entity_type = serializers.CharField(source="entity.entity_type", read_only=True)
    entity_label = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "company_name",
            "entity_name",
            "entity_type",
            "entity_label",
            "roles",
            "max_role_level",
            "can_edit",
        ]

    def get_roles(self, obj):
        return [
            {
                "key": assignment.role.key,
                "name": assignment.role.name,
                "level": ROLE_HIERARCHY.get(assignment.role.key, 0),
            }
            for assignment in obj.assigned_roles.select_related("role").all()
        ]

    def get_max_role_level(self, obj):
        roles = [ROLE_HIERARCHY.get(item["key"], 0) for item in self.get_roles(obj)]
        return max(roles, default=0)

    def get_can_edit(self, obj):
        actor_level = self.context.get("actor_level", 0)
        return self.get_max_role_level(obj) < actor_level

    def get_entity_label(self, obj):
        if not obj.entity:
            return ""
        return f"{obj.entity.name} ({obj.entity.get_entity_type_display()})"


class UserPermissionAdminDetailSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    effective_permission_keys = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True)
    entity_name = serializers.CharField(source="entity.name", read_only=True)
    entity_type = serializers.CharField(source="entity.entity_type", read_only=True)
    entity_label = serializers.SerializerMethodField()
    team_leader_name = serializers.CharField(source="team_leader.username", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "job_title",
            "phone_number",
            "company",
            "company_name",
            "entity",
            "entity_name",
            "entity_type",
            "entity_label",
            "team_leader",
            "team_leader_name",
            "roles",
            "effective_permission_keys",
            "permissions",
        ]

    def get_roles(self, obj):
        return [
            {
                "key": assignment.role.key,
                "name": assignment.role.name,
                "level": ROLE_HIERARCHY.get(assignment.role.key, 0),
            }
            for assignment in obj.assigned_roles.select_related("role").all()
        ]

    def get_effective_permission_keys(self, obj):
        return get_effective_permission_keys(obj)

    def get_permissions(self, obj):
        editor_user = self.context.get("editor_user")
        return get_permission_matrix_for_user(obj, editor_user=editor_user)

    def get_entity_label(self, obj):
        if not obj.entity:
            return ""
        return f"{obj.entity.name} ({obj.entity.get_entity_type_display()})"


class UserRoleUpdateSerializer(serializers.Serializer):
    role_keys = serializers.ListField(
        child=serializers.CharField(), allow_empty=True, required=True
    )
    team_leader_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_role_keys(self, value):
        unique_keys = list(dict.fromkeys(value))
        if len(unique_keys) != 1:
            raise serializers.ValidationError("Exactly one role must be assigned.")

        roles = list(Role.objects.filter(key__in=unique_keys, is_active=True))
        if len(roles) != len(unique_keys):
            raise serializers.ValidationError("One or more role keys are invalid.")
        if any(role.key not in ROLE_HIERARCHY for role in roles):
            raise serializers.ValidationError("One or more role keys are not assignable.")

        actor = self.context["request"].user
        actor_level = self.context["actor_level"]
        invalid_roles = [
            role.key
            for role in roles
            if ROLE_HIERARCHY.get(role.key, 0) >= actor_level
        ]
        if invalid_roles:
            raise serializers.ValidationError(
                f"You cannot assign roles at your level or higher: {', '.join(invalid_roles)}."
            )

        target_user = self.context["target_user"]
        actor = self.context["request"].user
        actor_role_key = get_primary_role_key(actor)
        role_key = unique_keys[0]

        # Role scope validations:
        # - super_admin: global, no company/entity requirement
        # - senior: must be attached to exactly one company (entity optional)
        # - manager/team_leader/user: must be attached to one company + one entity
        if role_key == "senior" and not target_user.company_id:
            raise serializers.ValidationError(
                "Senior must belong to a single company."
            )

        if role_key in {"manager", "team_leader", "user"}:
            if not target_user.company_id:
                raise serializers.ValidationError(
                    f"{role_key.replace('_', ' ').title()} must belong to a company."
                )
            if not target_user.entity_id:
                raise serializers.ValidationError(
                    f"{role_key.replace('_', ' ').title()} must belong to a single entity."
                )

        if target_user.company_id and target_user.entity_id:
            if target_user.entity.company_id != target_user.company_id:
                raise serializers.ValidationError(
                    "User company and entity must match."
                )

        resolved_team_leader = target_user.team_leader
        if role_key == "user":
            team_leader_id = self.initial_data.get("team_leader_id", None)
            if actor_role_key == "team_leader":
                resolved_team_leader = actor
            elif team_leader_id is not None:
                if not team_leader_id:
                    resolved_team_leader = None
                else:
                    resolved_team_leader = User.objects.filter(
                        id=team_leader_id, is_active=True
                    ).first()
                    if resolved_team_leader is None:
                        raise serializers.ValidationError(
                            "Assigned Team Leader is invalid."
                        )

        if role_key == "user" and resolved_team_leader:
            if resolved_team_leader.company_id != target_user.company_id:
                raise serializers.ValidationError(
                    "User and Team Leader must belong to the same company."
                )
            if resolved_team_leader.entity_id != target_user.entity_id:
                raise serializers.ValidationError(
                    "User and Team Leader must belong to the same entity."
                )
            if not UserRole.objects.filter(
                user_id=resolved_team_leader.id, role__key="team_leader"
            ).exists():
                raise serializers.ValidationError(
                    "Assigned Team Leader must have Team Leader role."
                )

        if (
            role_key == "user"
            and not resolved_team_leader
            and actor_role_key != "team_leader"
        ):
            raise serializers.ValidationError(
                "User must be assigned to a Team Leader from the same company and entity."
            )

        if unique_keys[0] == "senior" and target_user.company_id:
            senior_role = Role.objects.filter(key="senior").first()
            if senior_role is not None:
                senior_exists = UserRole.objects.filter(
                    role=senior_role,
                    user__company_id=target_user.company_id,
                ).exclude(user_id=target_user.id).exists()
                if senior_exists:
                    raise serializers.ValidationError(
                        "Each company can have exactly one Senior."
                    )
        self._resolved_team_leader = resolved_team_leader if role_key == "user" else None
        return unique_keys

    def save(self, **kwargs):
        user = self.context["target_user"]
        actor = self.context["request"].user
        actor_role_key = get_primary_role_key(actor)
        role_keys = self.validated_data["role_keys"]
        role = Role.objects.get(key=role_keys[0])

        resolved_team_leader = getattr(self, "_resolved_team_leader", None)

        if role.key == "user":
            user.team_leader = resolved_team_leader
            user.save(update_fields=["team_leader"])
        elif user.team_leader_id is not None:
            user.team_leader = None
            user.save(update_fields=["team_leader"])

        UserRole.objects.filter(user=user).delete()
        UserRole.objects.create(user=user, role=role)
        return user


class UserPermissionOverrideSerializer(serializers.Serializer):
    permission_key = serializers.CharField()
    reason = serializers.CharField(required=False, allow_blank=True)

    def validate_permission_key(self, value):
        if not AppPermission.objects.filter(key=value).exists():
            raise serializers.ValidationError("Invalid permission key.")
        delegatable_permission_keys = set(
            self.context.get("delegatable_permission_keys", [])
        )
        if value not in delegatable_permission_keys:
            raise serializers.ValidationError(
                "You cannot delegate this permission."
            )
        return value

    def apply(self, user, is_allowed):
        permission = AppPermission.objects.get(key=self.validated_data["permission_key"])
        override, _ = UserPermissionOverride.objects.update_or_create(
            user=user,
            permission=permission,
            defaults={
                "is_allowed": is_allowed,
                "reason": self.validated_data.get("reason", ""),
            },
        )
        return override


class ManagedUserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False, default=True)
    password = serializers.CharField(required=False, allow_blank=True)
    role_key = serializers.CharField()
    company_id = serializers.IntegerField(required=False, allow_null=True)
    entity_id = serializers.IntegerField(required=False, allow_null=True)
    team_leader_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        actor = self.context["request"].user
        actor_role = get_primary_role_key(actor)
        actor_level = self.context["actor_level"]

        role_key = attrs["role_key"]
        role = Role.objects.filter(key=role_key, is_active=True).first()
        if role is None or role_key not in ROLE_HIERARCHY:
            raise serializers.ValidationError({"role_key": "Invalid role."})
        if ROLE_HIERARCHY[role_key] >= actor_level:
            raise serializers.ValidationError(
                {"role_key": "You can only create users below your role level."}
            )

        if User.objects.filter(username=attrs["username"]).exists():
            raise serializers.ValidationError({"username": "Username already exists."})

        company = actor.company
        entity = actor.entity
        if actor_role == "super_admin":
            company_id = attrs.get("company_id")
            if not company_id:
                raise serializers.ValidationError({"company_id": "Company is required."})
            company = Company.objects.filter(id=company_id, is_active=True).first()
            if company is None:
                raise serializers.ValidationError({"company_id": "Invalid company."})

            entity_id = attrs.get("entity_id")
            if role_key in {"manager", "team_leader", "user"} and not entity_id:
                raise serializers.ValidationError({"entity_id": "Entity is required for this role."})
            if entity_id:
                entity = Entity.objects.filter(
                    id=entity_id, company_id=company.id, is_active=True
                ).first()
                if entity is None:
                    raise serializers.ValidationError(
                        {"entity_id": "Entity must belong to selected company."}
                    )

        if actor_role == "senior":
            if not company:
                raise serializers.ValidationError("Senior must belong to a company.")
            if role_key in {"manager", "team_leader", "user"}:
                entity_id = attrs.get("entity_id")
                if not entity_id:
                    raise serializers.ValidationError({"entity_id": "Entity is required."})
                entity = Entity.objects.filter(
                    id=entity_id, company_id=company.id, is_active=True
                ).first()
                if entity is None:
                    raise serializers.ValidationError(
                        {"entity_id": "Entity must belong to your company."}
                    )

        if actor_role in {"manager", "team_leader"}:
            if role_key not in {"team_leader", "user"}:
                raise serializers.ValidationError(
                    {"role_key": "You can only create Team Leaders or Users."}
                )
            if actor_role == "team_leader" and role_key != "user":
                raise serializers.ValidationError(
                    {"role_key": "Team Leader can only create Users."}
                )
            company = actor.company
            entity = actor.entity

        if role_key in {"manager", "team_leader", "user"} and entity is None:
            raise serializers.ValidationError({"entity_id": "Entity is required for this role."})

        team_leader = None
        if role_key == "user":
            team_leader_id = attrs.get("team_leader_id")
            if actor_role == "team_leader":
                team_leader = actor
            else:
                if not team_leader_id:
                    raise serializers.ValidationError(
                        {"team_leader_id": "Team Leader is required for User role."}
                    )
                team_leader = User.objects.filter(id=team_leader_id, is_active=True).first()
                if team_leader is None:
                    raise serializers.ValidationError({"team_leader_id": "Invalid Team Leader."})
            if team_leader.company_id != company.id or team_leader.entity_id != entity.id:
                raise serializers.ValidationError(
                    {"team_leader_id": "Team Leader must be in same company and entity."}
                )
            if not UserRole.objects.filter(user=team_leader, role__key="team_leader").exists():
                raise serializers.ValidationError(
                    {"team_leader_id": "Selected user is not a Team Leader."}
                )

        attrs["resolved_company"] = company
        attrs["resolved_entity"] = entity
        attrs["resolved_team_leader"] = team_leader
        attrs["resolved_role"] = role
        return attrs

    def create(self):
        attrs = self.validated_data
        actor = self.context["request"].user
        password = attrs.get("password") or "test12345"
        user = User.objects.create(
            username=attrs["username"],
            email=attrs.get("email", ""),
            first_name=attrs.get("first_name", ""),
            last_name=attrs.get("last_name", ""),
            is_active=attrs.get("is_active", True),
            company=attrs["resolved_company"],
            entity=attrs["resolved_entity"],
            team_leader=attrs["resolved_team_leader"],
        )
        user.set_password(password)
        user.save()
        UserRole.objects.create(user=user, role=attrs["resolved_role"])
        create_notification(
            user=user,
            event_type=UserNotification.EventType.USER_CREATED,
            title="Your account has been created",
            message=(
                f"{actor.username} created your account with role "
                f"{attrs['resolved_role'].key.replace('_', ' ')}."
            ),
            link="/profile",
            metadata={"created_by_user_id": actor.id},
        )
        return user


class ManagedUserUpdateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, required=False)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    password = serializers.CharField(required=False, allow_blank=True)
    company_id = serializers.IntegerField(required=False, allow_null=True)
    entity_id = serializers.IntegerField(required=False, allow_null=True)
    team_leader_id = serializers.IntegerField(required=False, allow_null=True)
    job_title = serializers.CharField(max_length=120, required=False, allow_blank=True)
    phone_number = serializers.CharField(max_length=30, required=False, allow_blank=True)

    def validate(self, attrs):
        actor = self.context["request"].user
        target = self.context["target_user"]
        actor_role = get_primary_role_key(actor)
        target_role = get_primary_role_key(target)

        username = attrs.get("username")
        if username and User.objects.filter(username=username).exclude(id=target.id).exists():
            raise serializers.ValidationError({"username": "Username already exists."})

        company = target.company
        entity = target.entity

        if actor_role == "super_admin":
            if "company_id" in attrs:
                company_id = attrs.get("company_id")
                if not company_id:
                    raise serializers.ValidationError({"company_id": "Company is required."})
                company = Company.objects.filter(id=company_id, is_active=True).first()
                if company is None:
                    raise serializers.ValidationError({"company_id": "Invalid company."})
            if "entity_id" in attrs:
                entity_id = attrs.get("entity_id")
                if entity_id:
                    entity = Entity.objects.filter(
                        id=entity_id, company_id=company.id, is_active=True
                    ).first()
                    if entity is None:
                        raise serializers.ValidationError(
                            {"entity_id": "Entity must belong to selected company."}
                        )
                else:
                    entity = None
        elif actor_role == "senior":
            company = actor.company
            if company is None:
                raise serializers.ValidationError("Senior must belong to a company.")
            if "entity_id" in attrs:
                entity_id = attrs.get("entity_id")
                if entity_id:
                    entity = Entity.objects.filter(
                        id=entity_id, company_id=company.id, is_active=True
                    ).first()
                    if entity is None:
                        raise serializers.ValidationError(
                            {"entity_id": "Entity must belong to your company."}
                        )
                else:
                    entity = None
        else:
            company = actor.company
            entity = actor.entity

        if target_role in {"manager", "team_leader", "user"} and entity is None:
            raise serializers.ValidationError(
                {"entity_id": "Entity is required for this role."}
            )
        if target_role == "senior" and company is None:
            raise serializers.ValidationError(
                {"company_id": "Company is required for Senior role."}
            )

        team_leader = target.team_leader
        if target_role == "user":
            if actor_role == "team_leader":
                team_leader = actor
            elif "team_leader_id" in attrs:
                team_leader_id = attrs.get("team_leader_id")
                if not team_leader_id:
                    raise serializers.ValidationError(
                        {"team_leader_id": "Team Leader is required for User role."}
                    )
                team_leader = User.objects.filter(id=team_leader_id, is_active=True).first()
                if team_leader is None:
                    raise serializers.ValidationError(
                        {"team_leader_id": "Invalid Team Leader."}
                    )
            elif team_leader is None:
                raise serializers.ValidationError(
                    {"team_leader_id": "Team Leader is required for User role."}
                )

            if team_leader.company_id != company.id or team_leader.entity_id != entity.id:
                raise serializers.ValidationError(
                    {"team_leader_id": "Team Leader must be in same company and entity."}
                )
            if not UserRole.objects.filter(
                user=team_leader, role__key="team_leader"
            ).exists():
                raise serializers.ValidationError(
                    {"team_leader_id": "Selected user is not a Team Leader."}
                )
        else:
            team_leader = None

        if company and entity and entity.company_id != company.id:
            raise serializers.ValidationError(
                {"entity_id": "Entity must belong to the selected company."}
            )

        attrs["resolved_company"] = company
        attrs["resolved_entity"] = entity
        attrs["resolved_team_leader"] = team_leader
        return attrs

    def update(self, user):
        for field in (
            "username",
            "first_name",
            "last_name",
            "email",
            "is_active",
            "job_title",
            "phone_number",
        ):
            if field in self.validated_data:
                setattr(user, field, self.validated_data[field])
        user.company = self.validated_data["resolved_company"]
        user.entity = self.validated_data["resolved_entity"]
        user.team_leader = self.validated_data["resolved_team_leader"]
        password = self.validated_data.get("password")
        if password:
            user.set_password(password)
        user.full_clean()
        user.save()
        return user
