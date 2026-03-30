"""Finance plugin manifest — widget and app definitions."""

from shared.schemas import (
    AppManifestSchema,
    WidgetManifestSchema,
    ConfigFieldSchema,
)


wallet_widget = WidgetManifestSchema(
    id="finance.total-balance",
    name="Total Balance",
    description="Shows total balance across all wallets",
    icon="Wallet",
    size="medium",
    config_fields=[
        ConfigFieldSchema(
            name="accountId",
            label="Wallet",
            type="select",
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
    size="large",
    config_fields=[],
)

recent_tx_widget = WidgetManifestSchema(
    id="finance.recent-transactions",
    name="Recent Transactions",
    description="Last 5 transactions across all wallets",
    icon="ArrowLeftRight",
    size="medium",
    config_fields=[],
)

finance_manifest = AppManifestSchema(
    id="finance",
    name="Finance",
    version="1.0.0",
    description="Track spending, budgets, and wallets",
    icon="Wallet",
    color="oklch(0.72 0.19 145)",
    widgets=[wallet_widget, budget_widget, recent_tx_widget],
    agent_description="Helps users track expenses, manage budgets, create wallets, and analyze spending patterns.",
    tools=[
        "finance_add_transaction",
        "finance_list_wallets",
        "finance_create_wallet",
        "finance_list_categories",
        "finance_list_transactions",
    ],
    models=["Wallet", "Transaction", "Category"],
    category="finance",
    tags=["finance", "budget", "wallets", "transactions"],
    author="Shin Team",
)
