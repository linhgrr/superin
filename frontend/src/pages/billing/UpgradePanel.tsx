import Check from "lucide-react/dist/esm/icons/check";
import Zap from "lucide-react/dist/esm/icons/zap";

import { PaymentProvider, SubscriptionRead, SubscriptionTier } from "@/types/generated";

interface UpgradePanelProps {
  subscription: SubscriptionRead | undefined;
  disabled: boolean;
  onCheckout: (provider: PaymentProvider) => void;
}

function FeatureItem({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
      <Check size={16} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
      <span>{text}</span>
    </div>
  );
}

export function UpgradePanel({ subscription, disabled, onCheckout }: UpgradePanelProps) {
  const isPro = subscription?.tier === SubscriptionTier.PAID;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
      {/* Free Plan Card */}
      <div style={{ 
        display: "flex", 
        flexDirection: "column", 
        gap: "1rem", 
        padding: "1.5rem",
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "16px"
      }}>
        <div>
          <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>Starter</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, marginTop: "0.25rem" }}>
            $0 <span style={{ fontSize: "1rem", color: "var(--color-foreground-muted)", fontWeight: 400 }}>/ month</span>
          </div>
        </div>
        <div style={{ color: "var(--color-foreground-muted)", fontSize: "0.9rem" }}>
          Basic access to get you started.
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem", flexGrow: 1 }}>
          <FeatureItem text="Basic AI Chat" />
          <FeatureItem text="Limited App & Widget Access" />
          <FeatureItem text="Standard Support" />
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", marginTop: "1rem" }}>
          <button className="btn btn-secondary" disabled style={{ width: "100%", justifyContent: "center" }}>
            {isPro ? "Included" : "Current Plan"}
          </button>
        </div>
      </div>

      {/* Pro Plan Card */}
      <div style={{ 
        display: "flex", 
        flexDirection: "column", 
        gap: "1rem", 
        padding: "1.5rem",
        backgroundColor: "var(--color-surface-elevated)",
        border: "1px solid var(--color-primary)",
        borderRadius: "16px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: "1.25rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Zap size={18} style={{ color: "var(--color-primary)" }} />
              Pro
            </div>
            <div style={{ fontSize: "2rem", fontWeight: 700, marginTop: "0.25rem" }}>
              $9.00 <span style={{ fontSize: "1rem", color: "var(--color-foreground-muted)", fontWeight: 400 }}>/ month</span>
            </div>
          </div>
          <span style={{ 
            fontSize: "0.75rem", 
            backgroundColor: "var(--color-primary)", 
            color: "var(--color-primary-foreground)", 
            padding: "0.15rem 0.5rem", 
            borderRadius: "4px",
            fontWeight: 600
          }}>
            RECOMMENDED
          </span>
        </div>
        
        <div style={{ color: "var(--color-foreground-muted)", fontSize: "0.9rem" }}>
          Unlimited power for professionals.
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem", flexGrow: 1 }}>
          <FeatureItem text="Unlimited AI Chat" />
          <FeatureItem text="Full App & Widget Access" />
          <FeatureItem text="Priority Support" />
          <FeatureItem text="Custom Configs" />
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
          {isPro ? (
            <button className="btn btn-primary" disabled style={{ width: "100%", justifyContent: "center" }}>
              Current Plan
            </button>
          ) : (
             <>
              <button
                className="btn btn-primary"
                disabled={disabled}
                onClick={() => onCheckout(PaymentProvider.STRIPE)}
                style={{ width: "100%", justifyContent: "center" }}
              >
                Upgrade with Stripe
              </button>
              <button
                className="btn btn-secondary"
                disabled={disabled}
                onClick={() => onCheckout(PaymentProvider.PAYOS)}
                style={{ width: "100%", justifyContent: "center" }}
              >
                Upgrade with PayOS
              </button>
             </>
          )}
        </div>
      </div>
    </div>
  );
}
