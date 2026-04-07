"""Finance plugin Pydantic request/response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from apps.finance.enums import TransactionType


class FinanceCreateWalletRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    currency: str = Field(default="USD", max_length=3)


class FinanceCreateCategoryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    icon: str = Field(default="Tag")
    color: str = Field(default="oklch(0.65 0.21 280)")
    budget: float = Field(default=0.0, ge=0)


class FinanceCreateTransactionRequest(BaseModel):
    wallet_id: str
    category_id: str
    type: TransactionType
    amount: float = Field(gt=0)
    date: datetime
    note: str | None = None


class FinanceTransferRequest(BaseModel):
    from_wallet_id: str
    to_wallet_id: str
    amount: float = Field(gt=0)
    note: str | None = None


class FinanceUpdateWalletRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)


class FinanceUpdateCategoryRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    icon: str | None = None
    color: str | None = None
    budget: float | None = Field(default=None, ge=0)


class FinanceUpdateTransactionRequest(BaseModel):
    wallet_id: str | None = None
    category_id: str | None = None
    amount: float | None = Field(default=None, gt=0)
    date: datetime | None = None
    note: str | None = None


class FinanceWalletRead(BaseModel):
    id: str
    name: str
    currency: str
    balance: float
    created_at: datetime


class FinanceCategoryRead(BaseModel):
    id: str
    name: str
    icon: str
    color: str
    budget: float
    created_at: datetime


class FinanceTransactionRead(BaseModel):
    id: str
    wallet_id: str
    category_id: str
    type: TransactionType
    amount: float
    date: datetime
    note: str | None = None
    created_at: datetime


class FinanceActionResponse(BaseModel):
    success: bool
    id: str
    message: str | None = None


class FinanceTransferResponse(BaseModel):
    from_wallet: FinanceWalletRead
    to_wallet: FinanceWalletRead
    amount: float
    note: str | None = None


class FinanceSummaryResponse(BaseModel):
    total_balance: float
    income_this_month: float
    expense_this_month: float
    transaction_count: int
    wallet_count: int


class FinanceBudgetCategoryStatus(BaseModel):
    category_id: str
    category_name: str
    budget: float
    spent: float
    remaining: float | None = None
    percentage_used: float | None = None
    over_budget: bool


class FinanceBudgetOverviewResponse(BaseModel):
    categories: list[FinanceBudgetCategoryStatus] = Field(default_factory=list)
    total_budget: float
    total_spent: float
    month: int
    year: int


class FinanceCategoryBreakdownItem(BaseModel):
    category: str
    amount: float
    percentage: float


class FinanceCategoryBreakdownResponse(BaseModel):
    month: int
    year: int
    total_spending: float
    breakdown: list[FinanceCategoryBreakdownItem] = Field(default_factory=list)
    category_count: int


class FinanceMonthlyTrendItem(BaseModel):
    year: int
    month: int
    income: float
    expense: float
    net: float


class FinanceMonthlyTrendResponse(BaseModel):
    trend: list[FinanceMonthlyTrendItem] = Field(default_factory=list)
    average_income: float
    average_expense: float
    average_net: float


FinanceBudgetCheckResponse = FinanceBudgetCategoryStatus | FinanceBudgetOverviewResponse
