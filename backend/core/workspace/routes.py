"""Workspace routes."""

from fastapi import APIRouter, Depends

from core.auth.dependencies import get_current_user
from core.workspace.service import build_workspace_bootstrap
from shared.schemas import WorkspaceBootstrap

router = APIRouter()


@router.get("/bootstrap")
async def get_workspace_bootstrap(
    user_id: str = Depends(get_current_user),
) -> WorkspaceBootstrap:
    """Return installed apps and widget preferences for the authenticated user."""
    return await build_workspace_bootstrap(user_id)
