from rest_framework.routers import DefaultRouter

from .views import (
    MainBranchViewSet,
    OperationalUnitViewSet,
    RequestMessageViewSet,
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

urlpatterns = router.urls
