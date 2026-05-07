from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import ChangePasswordSerializer, UserMeSerializer, UserThemePreferenceSerializer


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserMeSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        mutable_data = request.data.copy()
        remove_avatar_flag = str(mutable_data.get("remove_avatar", "")).lower() in {"1", "true", "yes"}
        if remove_avatar_flag:
            mutable_data["avatar"] = None
        serializer = UserThemePreferenceSerializer(
            request.user,
            data=mutable_data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserMeSerializer(request.user, context={"request": request}).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Password updated successfully."})





