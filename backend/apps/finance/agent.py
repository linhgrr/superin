"""Finance plugin LangGraph agent."""

from langchain_core.tools import BaseTool

from apps.finance.tools import (
    finance_add_transaction,
    finance_create_wallet,
    finance_list_categories,
    finance_list_transactions,
    finance_list_wallets,
)
from apps.finance.prompts import get_finance_prompt
from apps.finance.service import finance_service
from core.agents.base_app import BaseAppAgent
from shared.agent_context import set_user_context


class FinanceAgent(BaseAppAgent):
    """Finance app child agent used by the root orchestrator."""

    app_id = "finance"

    def tools(self) -> list[BaseTool]:
        return [
            finance_add_transaction,
            finance_list_wallets,
            finance_create_wallet,
            finance_list_categories,
            finance_list_transactions,
        ]

    def build_prompt(self) -> str:
        return get_finance_prompt()

    async def on_install(self, user_id: str) -> None:
        set_user_context(user_id)
        await finance_service.on_install(user_id)

    async def on_uninstall(self, user_id: str) -> None:
        set_user_context(user_id)
        await finance_service.on_uninstall(user_id)
