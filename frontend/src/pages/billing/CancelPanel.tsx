import { SubscriptionTier } from "@/types/generated";
import type { SubscriptionRead } from "@/types/generated";

interface CancelPanelProps {
  subscription: SubscriptionRead | undefined;
  disabled: boolean;
  onCancel: () => void;
}

export function CancelPanel({ subscription, disabled, onCancel }: CancelPanelProps) {
  return (
    <div className="widget-card">
      <div className="widget-card-title">Cancel</div>
      <p style={{ margin: 0, color: "var(--color-foreground-muted)" }}>
        Cancelling sets your tier back to free.
      </p>
      <div>
        <button
          className="btn btn-ghost"
          disabled={disabled || subscription?.tier !== SubscriptionTier.PAID}
          onClick={onCancel}
        >
          Cancel subscription
        </button>
      </div>
    </div>
  );
}
