"""Finance plugin registration — auto-discovered at startup."""

from core.registry import register_plugin
from apps.finance.manifest import finance_manifest
from apps.finance.agent import FinanceAgent
from apps.finance.routes import router
from apps.finance.models import Wallet, Transaction, Category

register_plugin(
    manifest=finance_manifest,
    agent=FinanceAgent(),
    router=router,
    models=[Wallet, Transaction, Category],
)
