"""Finance plugin manifest — widget and app definitions."""

from shared.enums import ConfigFieldType, SubscriptionTier, WidgetSize
from shared.schemas import (
    AppManifestSchema,
    ConfigFieldSchema,
    WidgetManifestSchema,
)

wallet_widget = WidgetManifestSchema(
    id="finance.total-balance",
    name="Total Balance",
    description="Shows total balance across all wallets",
    icon="Wallet",
    size=WidgetSize.STANDARD,
    config_fields=[
        ConfigFieldSchema(
            name="accountId",
            label="Wallet",
            type=ConfigFieldType.SELECT,
            required=False,
            options_source="finance.wallets",
        ),
    ],
)

budget_widget = WidgetManifestSchema(
    id="finance.budget-overview",
    name="Budget Overview",
    description="Monthly spending vs budget by category",
    icon="PieChart",
    size=WidgetSize.WIDE,
    config_fields=[],
)

recent_tx_widget = WidgetManifestSchema(
    id="finance.recent-transactions",
    name="Recent Transactions",
    description="Last 5 transactions across all wallets",
    icon="ArrowLeftRight",
    size=WidgetSize.STANDARD,
    config_fields=[],
)

finance_manifest = AppManifestSchema(
    id="finance",
    name="Finance",
    version="1.1.0",
    description="Track spending, budgets, and wallets with analytics",
    icon="Wallet",
    color="oklch(0.72 0.19 145)",
    widgets=[wallet_widget, budget_widget, recent_tx_widget],
    agent_description="Helps users track expenses, manage budgets, create wallets, analyze spending patterns, and monitor financial trends.",
    tools=[
        "finance_list_wallets",
        "finance_get_wallet",
        "finance_create_wallet",
        "finance_update_wallet",
        "finance_delete_wallet",
        "finance_list_categories",
        "finance_get_category",
        "finance_create_category",
        "finance_update_category",
        "finance_delete_category",
        "finance_list_transactions",
        "finance_get_transaction",
        "finance_search_transactions",
        "finance_add_transaction",
        "finance_update_transaction",
        "finance_delete_transaction",
        "finance_transfer",
        "finance_check_budget",
        "finance_get_category_breakdown",
        "finance_get_monthly_trend",
        "finance_get_summary",
    ],
    models=["Wallet", "Transaction", "Category"],
    category="finance",
    tags=["finance", "budget", "wallets", "transactions", "analytics"],
    author="Superin Team",
    requires_tier=SubscriptionTier.PAID,
)
