"""Shared helpers for S3-compatible object storage."""

from __future__ import annotations

from urllib.parse import quote

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


def get_upload_endpoint() -> str:
    endpoint = normalize_endpoint(
        settings.object_storage_endpoint_internal,
        default_scheme="http",
    ) or normalize_endpoint(
        settings.object_storage_endpoint_external,
        default_scheme="https",
    )
    if not endpoint:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage endpoint is not configured.",
        )
    return endpoint


def get_public_base_url() -> str:
    return normalize_endpoint(
        settings.object_storage_endpoint_external,
        default_scheme="https",
    ) or get_upload_endpoint()


def build_public_object_url(*, bucket: str, object_key: str) -> str:
    encoded_key = quote(object_key, safe="/")
    return f"{get_public_base_url()}/{bucket}/{encoded_key}"


def get_s3_client():
    if not settings.object_storage_access_key or not settings.object_storage_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage credentials are not configured.",
        )
    return boto3.client(
        "s3",
        endpoint_url=get_upload_endpoint(),
        region_name=settings.object_storage_region,
        aws_access_key_id=settings.object_storage_access_key,
        aws_secret_access_key=settings.object_storage_secret_key,
        config=BotoConfig(
            signature_version="s3v4",
            s3={"addressing_style": settings.object_storage_addressing_style},
        ),
    )
