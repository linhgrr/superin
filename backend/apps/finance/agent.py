"""Finance plugin LangGraph agent."""

from apps.finance.tools import (
    finance_add_transaction,
    finance_list_wallets,
    finance_create_wallet,
    finance_list_categories,
    finance_list_transactions,
)
from apps.finance.service import finance_service
from shared.agent_context import set_user_context
from shared.interfaces import AgentProtocol

class FinanceAgent(AgentProtocol):
    """Finance app agent — handles money management via chat."""

    @property
    def graph(self):
        return None  # Reserved for future multi-step graph

    def tools(self) -> list:
        return [
            finance_add_transaction,
            finance_list_wallets,
            finance_create_wallet,
            finance_list_categories,
            finance_list_transactions,
        ]

    async def on_install(self, user_id: str) -> None:
        set_user_context(user_id)
        await finance_service.on_install(user_id)

    async def on_uninstall(self, user_id: str) -> None:
        set_user_context(user_id)
        await finance_service.on_uninstall(user_id)
