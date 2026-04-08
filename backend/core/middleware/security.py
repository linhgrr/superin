"""Security headers middleware for enhanced security.

Provides protection against common web vulnerabilities:
- XSS via CSP and X-XSS-Protection
- Clickjacking via X-Frame-Options
- MIME sniffing via X-Content-Type-Options
- HTTPS enforcement via HSTS
- Referrer control
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# Security headers configuration
SECURITY_HEADERS = {
    # Prevent MIME type sniffing
    "X-Content-Type-Options": "nosniff",
    # XSS protection for older browsers
    "X-XSS-Protection": "1; mode=block",
    # Prevent clickjacking - only allow same origin framing
    "X-Frame-Options": "SAMEORIGIN",
    # Control referrer information
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # Content Security Policy - restrict resource loading
    # Note: Adjust this based on your frontend requirements
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "  # Allow inline scripts for React
        "style-src 'self' 'unsafe-inline'; "   # Allow inline styles
        "img-src 'self' data: https:; "        # Allow images from self, data URIs, and HTTPS
        "font-src 'self' data:; "              # Allow fonts from self and data URIs
        "connect-src 'self' https:; "          # Allow API calls to same origin and HTTPS
        "frame-ancestors 'self'; "             # Only allow framing from same origin
        "base-uri 'self'; "                   # Restrict base URL
        "form-action 'self'; "                 # Restrict form submissions
    ),
    # Permissions Policy - restrict browser features
    "Permissions-Policy": (
        "camera=(), "
        "microphone=(), "
        "geolocation=(), "
        "accelerometer=(), "
        "autoplay=(), "
        "encrypted-media=(), "
        "gyroscope=(), "
        "magnetometer=(), "
        "payment=(), "
        "usb=()"
    ),
    # Remove server identification
    "Server": "Shin-SuperApp",
}

# HSTS header (only in production with HTTPS)
HSTS_HEADER = "max-age=31536000; includeSubDomains; preload"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)

        # Add standard security headers
        for header, value in SECURITY_HEADERS.items():
            response.headers[header] = value

        # Add HSTS for HTTPS requests (indicated by X-Forwarded-Proto or direct HTTPS)
        # This helps ensure the header is only set when HTTPS is actually used
        is_https = (
            request.headers.get("X-Forwarded-Proto") == "https"
            or request.url.scheme == "https"
        )
        if is_https:
            response.headers["Strict-Transport-Security"] = HSTS_HEADER

        return response
