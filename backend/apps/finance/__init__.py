"""Finance plugin registration — auto-discovered at startup."""

from apps.finance.agent import FinanceAgent
from apps.finance.manifest import finance_manifest
from apps.finance.models import Category, Transaction, Wallet
from apps.finance.routes import (
    get_budget_overview_widget_data,
    get_recent_transactions_widget_data,
    get_total_balance_widget_data,
    router,
)
from apps.finance.schemas import (
    BudgetOverviewWidgetConfig,
    RecentTransactionsWidgetConfig,
    TotalBalanceWidgetConfig,
)
from core.registry import (
    register_plugin,
    register_widget_config_model,
    register_widget_data_handler,
)

register_plugin(
    manifest=finance_manifest,
    agent=FinanceAgent(),
    router=router,
    models=[Wallet, Transaction, Category],
)

register_widget_config_model("finance.total-balance", TotalBalanceWidgetConfig)
register_widget_config_model("finance.budget-overview", BudgetOverviewWidgetConfig)
register_widget_config_model("finance.recent-transactions", RecentTransactionsWidgetConfig)

register_widget_data_handler("finance.total-balance", get_total_balance_widget_data)
register_widget_data_handler("finance.budget-overview", get_budget_overview_widget_data)
register_widget_data_handler("finance.recent-transactions", get_recent_transactions_widget_data)
