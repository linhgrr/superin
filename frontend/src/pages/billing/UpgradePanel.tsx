import { PaymentProvider } from "@/types/generated";

interface UpgradePanelProps {
  disabled: boolean;
  onCheckout: (provider: PaymentProvider) => void;
}

export function UpgradePanel({ disabled, onCheckout }: UpgradePanelProps) {
  return (
    <div className="widget-card">
      <div className="widget-card-title">Upgrade</div>
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <button
          className="btn btn-primary"
          disabled={disabled}
          onClick={() => onCheckout(PaymentProvider.STRIPE)}
        >
          Upgrade with Stripe
        </button>
        <button
          className="btn btn-secondary"
          disabled={disabled}
          onClick={() => onCheckout(PaymentProvider.PAYOS)}
        >
          Upgrade with PayOS
        </button>
      </div>
    </div>
  );
}
