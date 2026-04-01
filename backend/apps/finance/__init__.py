"""Finance plugin registration — auto-discovered at startup."""

from apps.finance.agent import FinanceAgent
from apps.finance.manifest import finance_manifest
from apps.finance.models import Category, Transaction, Wallet
from apps.finance.routes import router
from core.registry import register_plugin

register_plugin(
    manifest=finance_manifest,
    agent=FinanceAgent(),
    router=router,
    models=[Wallet, Transaction, Category],
)
