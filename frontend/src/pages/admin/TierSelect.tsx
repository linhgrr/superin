import { SubscriptionTier } from "@/types/generated";

interface TierSelectProps {
  value: SubscriptionTier;
  onChange: (next: SubscriptionTier) => void;
  disabled?: boolean;
}

export function TierSelect({ value, onChange, disabled }: TierSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SubscriptionTier)}
      disabled={disabled}
      style={{ minWidth: "110px" }}
    >
      <option value={SubscriptionTier.FREE}>free</option>
      <option value={SubscriptionTier.PAID}>paid</option>
    </select>
  );
}