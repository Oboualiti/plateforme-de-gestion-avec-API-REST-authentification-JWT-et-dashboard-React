import time
import logging
from colorama import Fore, Back, Style, init

init(autoreset=True)

logger = logging.getLogger("api_requests")


class ApiRequestLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.perf_counter()
        response = self.get_response(request)
        duration_ms = int((time.perf_counter() - start) * 1000)

        method = request.method
        path = request.get_full_path()
        status = response.status_code

        method_styles = {
            "GET": Back.BLUE + Fore.WHITE,
            "POST": Back.GREEN + Fore.BLACK,
            "PUT": Back.YELLOW + Fore.BLACK,
            "PATCH": Back.MAGENTA + Fore.WHITE,
            "DELETE": Back.RED + Fore.WHITE,
        }

        if status < 300:
            status_style = Fore.GREEN
        elif status < 400:
            status_style = Fore.CYAN
        elif status < 500:
            status_style = Fore.YELLOW
        else:
            status_style = Fore.RED

        if duration_ms < 100:
            time_style = Fore.GREEN
        elif duration_ms < 300:
            time_style = Fore.YELLOW
        else:
            time_style = Fore.RED

        method_badge = f"{method_styles.get(method, Back.WHITE + Fore.BLACK)} {method:<6} {Style.RESET_ALL}"
        status_text = f"{status_style}{status}{Style.RESET_ALL}"
        time_text = f"{time_style}{duration_ms}ms{Style.RESET_ALL}"

        logger.info(
            f"{method_badge}  "
            f"{Fore.WHITE}{path:<60}{Style.RESET_ALL}  "
            f"{status_text:<12} "
            f"{time_text}"
        )

        return response