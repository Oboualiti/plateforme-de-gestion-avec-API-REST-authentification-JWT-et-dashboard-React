from django.urls import path

from .views import (
    ManageableUserListView,
    ManageUserDetailView,
    ManageUserPermissionOverrideView,
)

urlpatterns = [
    path("users/manageable/", ManageableUserListView.as_view(), name="manageable-users"),
    path("users/<int:user_id>/", ManageUserDetailView.as_view(), name="manage-user-detail"),
    path(
        "users/<int:user_id>/permissions/",
        ManageUserPermissionOverrideView.as_view(),
        name="manage-user-permissions",
    ),
]
