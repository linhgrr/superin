"""Shared helpers for S3-compatible object storage."""

from __future__ import annotations

import os
import socket
from functools import lru_cache
from urllib.parse import quote, urlparse

import boto3
from botocore.client import Config as BotoConfig
from fastapi import HTTPException, status

from core.config import settings


def normalize_endpoint(endpoint: str | None, *, default_scheme: str) -> str | None:
    if not endpoint:
        return None
    endpoint = endpoint.strip()
    if not endpoint:
        return None
    if endpoint.startswith("http://") or endpoint.startswith("https://"):
        return endpoint.rstrip("/")
    return f"{default_scheme}://{endpoint.rstrip('/')}"


def is_running_in_kubernetes() -> bool:
    """Detect Kubernetes runtime via injected service env var."""
    return bool(os.getenv("KUBERNETES_SERVICE_HOST"))


def _is_endpoint_resolvable(endpoint: str) -> bool:
    parsed = urlparse(endpoint)
    hostname = parsed.hostname
    if not hostname:
        return False

    try:
        socket.getaddrinfo(hostname, parsed.port)
        return True
    except OSError:
        return False


def get_upload_endpoint() -> str:
    return _get_upload_endpoint_cached(
        hf_space=settings.hf_space,
        kubernetes=is_running_in_kubernetes(),
        internal_endpoint=normalize_endpoint(
            settings.object_storage_endpoint_internal,
            default_scheme="http",
        ),
        external_endpoint=normalize_endpoint(
            settings.object_storage_endpoint_external,
            default_scheme="https",
        ),
    )


@lru_cache(maxsize=16)
def _get_upload_endpoint_cached(
    *,
    hf_space: bool,
    kubernetes: bool,
    internal_endpoint: str | None,
    external_endpoint: str | None,
) -> str:
    if hf_space:
        ordered_candidates = [external_endpoint, internal_endpoint]
    elif kubernetes:
        ordered_candidates = [internal_endpoint, external_endpoint]
    else:
        ordered_candidates = [external_endpoint, internal_endpoint]

    candidates = [endpoint for endpoint in ordered_candidates if endpoint]
    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage endpoint is not configured.",
        )

    for endpoint in candidates:
        if _is_endpoint_resolvable(endpoint):
            return endpoint

    return candidates[0]


def get_public_base_url() -> str:
    return _get_public_base_url_cached(
        external_endpoint=normalize_endpoint(
            settings.object_storage_endpoint_external,
            default_scheme="https",
        ),
        upload_endpoint=get_upload_endpoint(),
    )


@lru_cache(maxsize=16)
def _get_public_base_url_cached(*, external_endpoint: str | None, upload_endpoint: str) -> str:
    return external_endpoint or upload_endpoint


def build_public_object_url(*, bucket: str, object_key: str) -> str:
    encoded_key = quote(object_key, safe="/")
    return f"{get_public_base_url()}/{bucket}/{encoded_key}"


def get_s3_client():
    """Return a cached S3 client singleton.

    H5: Reuses the boto3 connection pool across requests.
    The client is thread-safe for concurrent reads and writes per AWS docs.
    """
    if not settings.object_storage_access_key or not settings.object_storage_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage credentials are not configured.",
        )
    return _get_s3_client_cached(
        endpoint_url=get_upload_endpoint(),
        region_name=settings.object_storage_region,
        aws_access_key_id=settings.object_storage_access_key,
        aws_secret_access_key=settings.object_storage_secret_key,
        addressing_style=settings.object_storage_addressing_style,
    )

@lru_cache(maxsize=1)
def _get_s3_client_cached(
    *,
    endpoint_url: str,
    region_name: str,
    aws_access_key_id: str,
    aws_secret_access_key: str,
    addressing_style: str,
):
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        region_name=region_name,
        aws_access_key_id=aws_access_key_id,
        aws_secret_access_key=aws_secret_access_key,
        config=BotoConfig(
            signature_version="s3v4",
            s3={"addressing_style": addressing_style},
        ),
    )
