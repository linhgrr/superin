"""Avatar upload service backed by S3-compatible object storage."""

from __future__ import annotations

import logging
from uuid import uuid4

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile, status

from core.config import settings
from core.utils.object_storage import build_public_object_url, get_s3_client

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def _sniff_image_type(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _resolve_content_type(upload_file: UploadFile, data: bytes) -> str:
    declared = (upload_file.content_type or "").lower().strip()
    sniffed = _sniff_image_type(data)

    if declared in ALLOWED_IMAGE_TYPES:
        return declared
    if sniffed in ALLOWED_IMAGE_TYPES:
        return sniffed

    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail="Only JPEG, PNG, WEBP, and GIF images are allowed.",
    )


async def upload_avatar(user_id: str, upload_file: UploadFile) -> str:
    bucket = settings.object_storage_bucket
    if not bucket:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage bucket is not configured.",
        )

    max_bytes = settings.object_storage_avatar_max_bytes
    data = await upload_file.read(max_bytes + 1)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar file is empty.")
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Avatar is too large. Max size is {max_bytes // (1024 * 1024)}MB.",
        )

    content_type = _resolve_content_type(upload_file, data)
    extension = ALLOWED_IMAGE_TYPES[content_type]
    prefix = settings.object_storage_avatar_prefix.strip("/")
    object_key = f"{prefix}/{user_id}/{uuid4().hex}{extension}"

    s3_client = get_s3_client()
    try:
        s3_client.put_object(
            Bucket=bucket,
            Key=object_key,
            Body=data,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
    except (ClientError, BotoCoreError) as exc:
        logger.exception("Failed to upload avatar to object storage")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to upload avatar to object storage.",
        ) from exc

    return build_public_object_url(bucket=bucket, object_key=object_key)
