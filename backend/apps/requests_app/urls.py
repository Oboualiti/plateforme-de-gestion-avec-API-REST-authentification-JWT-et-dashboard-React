from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    MainBranchViewSet,
    OperationalUnitViewSet,
    RequestCommentCreateView,
    RequestDetailView,
    RequestMessageViewSet,
    RequestListCreateView,
    RequestStatusUpdateView,
    RequestStatusHistoryViewSet,
    ServiceRequestViewSet,
    UnitMembershipViewSet,
)

router = DefaultRouter()
router.register(r"main-branches", MainBranchViewSet, basename="main-branch")
router.register(r"operational-units", OperationalUnitViewSet, basename="operational-unit")
router.register(r"unit-memberships", UnitMembershipViewSet, basename="unit-membership")
router.register(r"service-requests", ServiceRequestViewSet, basename="service-request")
router.register(
    r"request-status-history",
    RequestStatusHistoryViewSet,
    basename="request-status-history",
)
router.register(r"request-messages", RequestMessageViewSet, basename="request-message")

urlpatterns = [
    path("requests/", RequestListCreateView.as_view(), name="requests-list-create"),
    path("requests/<int:request_id>/", RequestDetailView.as_view(), name="requests-detail"),
    path(
        "requests/<int:request_id>/comments/",
        RequestCommentCreateView.as_view(),
        name="requests-comments",
    ),
    path(
        "requests/<int:request_id>/status/",
        RequestStatusUpdateView.as_view(),
        name="requests-status",
    ),
] + router.urls
