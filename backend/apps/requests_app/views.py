from rest_framework import viewsets

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
    RequestMessageSerializer,
    RequestStatusHistorySerializer,
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
