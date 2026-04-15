from django.urls import path

from .views import (
    ManageableUserCrudView,
    ManageableUserFormOptionsView,
    ManageableUserListView,
    ManageUserDetailView,
    ManageUserPermissionOverrideView,
)

urlpatterns = [
    path("users/manageable/", ManageableUserListView.as_view(), name="manageable-users"),
    path(
        "users/manageable/options/",
        ManageableUserFormOptionsView.as_view(),
        name="manageable-user-options",
    ),
    path(
        "users/manageable/<int:user_id>/",
        ManageableUserCrudView.as_view(),
        name="manageable-user-crud",
    ),
    path("users/<int:user_id>/", ManageUserDetailView.as_view(), name="manage-user-detail"),
    path(
        "users/<int:user_id>/permissions/",
        ManageUserPermissionOverrideView.as_view(),
        name="manage-user-permissions",
    ),
]
