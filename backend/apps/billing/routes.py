"""Billing routes — stub for Phase 1 (RBAC). Full implementation in Plan B."""

import logging

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends

from apps.billing.models import Subscription
from apps.billing.schemas import SubscriptionRead
from core.auth import get_current_user
from shared.enums import SubscriptionStatus, SubscriptionTier

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/subscription", response_model=SubscriptionRead)
async def get_my_subscription(
    user_id: str = Depends(get_current_user),
) -> SubscriptionRead:
    """Return the current user's subscription (or default free/inactive)."""
    sub = await Subscription.find_one(
        Subscription.user_id == PydanticObjectId(user_id),
    )
    if sub is None:
        return SubscriptionRead(
            tier=SubscriptionTier.FREE,
            status=SubscriptionStatus.INACTIVE,
            provider=None,
            started_at=None,
            expires_at=None,
        )
    return SubscriptionRead(
        tier=sub.tier,
        status=sub.status,
        provider=sub.provider,
        started_at=sub.started_at,
        expires_at=sub.expires_at,
    )
