"""Finance plugin type enums — owned by this plugin, imported by its own modules."""

from __future__ import annotations

from typing import Literal

TransactionType = Literal["income", "expense"]
"""Valid values for Transaction.type."""
