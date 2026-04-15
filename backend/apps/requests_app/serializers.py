from rest_framework import serializers

from .models import (
    MainBranch,
    OperationalUnit,
    RequestMessage,
    RequestStatusHistory,
    ServiceRequest,
    UnitMembership,
)


class MainBranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = MainBranch
        fields = "__all__"


class OperationalUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = OperationalUnit
        fields = "__all__"


class UnitMembershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitMembership
        fields = "__all__"


class ServiceRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceRequest
        fields = "__all__"


class RequestStatusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = RequestStatusHistory
        fields = "__all__"


class RequestMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequestMessage
        fields = "__all__"
