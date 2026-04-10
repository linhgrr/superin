import { CreditCard } from "lucide-react";

import { SubscriptionStatus, SubscriptionTier } from "@/types/generated";
import type { SubscriptionRead } from "@/types/generated";

interface PlanCardProps {
  subscription: SubscriptionRead | undefined;
}

export function PlanCard({ subscription }: PlanCardProps) {
  return (
    <div className="widget-card">
      <div className="widget-card-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <CreditCard size={18} />
        Current Plan
      </div>
      <div style={{ display: "grid", gap: "0.45rem" }}>
        <div><strong>Tier:</strong> {subscription?.tier ?? SubscriptionTier.FREE}</div>
        <div><strong>Status:</strong> {subscription?.status ?? SubscriptionStatus.INACTIVE}</div>
        <div><strong>Provider:</strong> {subscription?.provider ?? "-"}</div>
      </div>
    </div>
  );
}
