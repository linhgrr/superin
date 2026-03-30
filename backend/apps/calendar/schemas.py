"""Calendar plugin Pydantic request schemas."""

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field


class CreateCalendarRequest(BaseModel):
    # TODO: define fields matching your model + service.create()
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None


class UpdateCalendarRequest(BaseModel):
    # TODO: define fields matching your service.update()
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
