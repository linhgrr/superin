from urllib.parse import urlparse

from fastapi import Request

LOCAL_DEV_HOSTS = {"localhost", "127.0.0.1"}


def build_local_dev_origin_regex(cors_origins: list[str]) -> str | None:
    if not any((urlparse(origin).hostname or "") in LOCAL_DEV_HOSTS for origin in cors_origins):
        return None

    # Vite will often fall forward to another port, and some setups bind to 127.0.0.1
    # instead of localhost. Treat both loopback hosts as equivalent in development.
    return r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


def request_uses_https(request: Request) -> bool:
    forwarded_proto = request.headers.get("X-Forwarded-Proto", "").split(",")[0].strip()
    return forwarded_proto == "https" or request.url.scheme == "https"


def should_use_secure_cookie(request: Request) -> bool:
    if request_uses_https(request):
        return True

    return (request.url.hostname or "") not in LOCAL_DEV_HOSTS
