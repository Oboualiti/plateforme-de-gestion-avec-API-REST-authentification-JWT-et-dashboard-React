from django.http import JsonResponse
from django.utils import timezone


def health_check(request):
    return JsonResponse(
        {
            "status": "ok",
            "service": "backend",
            "timestamp": timezone.now().isoformat(),
        }
    )
