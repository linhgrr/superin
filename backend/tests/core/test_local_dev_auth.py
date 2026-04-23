from fastapi import Request

from core.http_utils import build_local_dev_origin_regex, should_use_secure_cookie


def _build_request(url: str, headers: dict[str, str] | None = None) -> Request:
    scheme, netloc = url.split("://", 1)
    host, _, port_text = netloc.partition(":")
    port = int(port_text) if port_text else (443 if scheme == "https" else 80)
    request_headers = {"host": netloc, **(headers or {})}
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [
            (key.lower().encode("latin-1"), value.encode("latin-1"))
            for key, value in request_headers.items()
        ],
        "scheme": scheme,
        "server": (host, port),
        "client": ("127.0.0.1", 12345),
        "query_string": b"",
        "root_path": "",
    }
    return Request(scope)


def test_local_dev_origins_accept_any_loopback_port() -> None:
    regex = build_local_dev_origin_regex(["http://localhost:5173"])

    assert regex == r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


def test_remote_only_origins_do_not_enable_loopback_regex() -> None:
    assert build_local_dev_origin_regex(["https://app.example.com"]) is None


def test_localhost_http_uses_non_secure_cookie() -> None:
    request = _build_request("http://localhost:8000")

    assert should_use_secure_cookie(request) is False


def test_https_requests_keep_secure_cookie() -> None:
    request = _build_request(
        "http://api.example.com",
        headers={"X-Forwarded-Proto": "https"},
    )

    assert should_use_secure_cookie(request) is True
