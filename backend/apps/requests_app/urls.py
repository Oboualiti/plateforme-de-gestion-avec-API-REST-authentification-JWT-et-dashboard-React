from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CreditsEvidenceCreateView,
    CreditsEvidenceDeleteView,
    CreditsSolvesListView,
    MainBranchViewSet,
    OperationalUnitViewSet,
    RequestCommentCreateView,
    RequestCommentDownloadView,
    RequestCommentPinView,
    RequestCommentUpdateView,
    RequestDeadlineUpdateView,
    RequestDetailView,
    RequestAssignToMeView,
    RequestAssignUserView,
    RequestAiImproveView,
    RequestAiSummaryView,
    RequestMessageViewSet,
    RequestListCreateView,
    RequestTargetReassignView,
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
    path("credits/solves/", CreditsSolvesListView.as_view(), name="credits-solves-list"),
    path("credits/solves/<int:request_id>/evidence/", CreditsEvidenceCreateView.as_view(), name="credits-solves-evidence"),
    path("credits/solves/<int:request_id>/evidence/<int:message_id>/", CreditsEvidenceDeleteView.as_view(), name="credits-solves-evidence-delete"),
    path("requests/ai/improve/", RequestAiImproveView.as_view(), name="requests-ai-improve"),
    path("requests/<int:request_id>/ai-summary/", RequestAiSummaryView.as_view(), name="requests-ai-summary"),
    path("requests/", RequestListCreateView.as_view(), name="requests-list-create"),
    path("requests/<int:request_id>/", RequestDetailView.as_view(), name="requests-detail"),
    path(
        "requests/<int:request_id>/comments/",
        RequestCommentCreateView.as_view(),
        name="requests-comments",
    ),
    path(
        "requests/<int:request_id>/comments/<int:comment_id>/",
        RequestCommentUpdateView.as_view(),
        name="requests-comments-update",
    ),
    path(
        "requests/<int:request_id>/comments/<int:comment_id>/pin/",
        RequestCommentPinView.as_view(),
        name="requests-comments-pin",
    ),
    path(
        "requests/<int:request_id>/comments/<int:comment_id>/download/",
        RequestCommentDownloadView.as_view(),
        name="requests-comments-download",
    ),
    path(
        "requests/<int:request_id>/status/",
        RequestStatusUpdateView.as_view(),
        name="requests-status",
    ),
    path(
        "requests/<int:request_id>/deadline/",
        RequestDeadlineUpdateView.as_view(),
        name="requests-deadline",
    ),
    path(
        "requests/<int:request_id>/assign/",
        RequestAssignToMeView.as_view(),
        name="requests-assign",
    ),
    path(
        "requests/<int:request_id>/reassign/",
        RequestTargetReassignView.as_view(),
        name="requests-reassign",
    ),
    path(
        "requests/<int:request_id>/assign_user/",
        RequestAssignUserView.as_view(),
        name="requests-assign-user",
    ),
] + router.urls
