/**
 * BillingPage — self-service subscription management.
 */

import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import { useState } from "react";
import useSWR from "swr";

import { cancelMySubscription, createCheckout, getMySubscription } from "@/api/subscriptions";
import { useToast } from "@/components/providers/ToastProvider";
import { PaymentProvider } from "@/types/generated";
import { CancelPanel } from "./CancelPanel";
import { PlanCard } from "./PlanCard";
import { UpgradePanel } from "./UpgradePanel";

export default function BillingPage() {
  const toast = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const subscriptionSwr = useSWR("subscription:me", getMySubscription);
  const subscription = subscriptionSwr.data;

  async function handleCheckout(provider: PaymentProvider) {
    const busy = `checkout:${provider}`;
    setBusyKey(busy);
    try {
      const result = await createCheckout({ provider });
      window.location.href = result.checkout_url;
    } catch (error: unknown) {
      console.error("Failed to create checkout", error);
      toast.error("Unable to start checkout. Please try again.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCancel() {
    setBusyKey("cancel");
    try {
      await cancelMySubscription();
      await subscriptionSwr.mutate();
      toast.success("Subscription cancelled");
    } catch (error: unknown) {
      console.error("Failed to cancel subscription", error);
      toast.error("Failed to cancel subscription");
    } finally {
      setBusyKey(null);
    }
  }

  if (subscriptionSwr.isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "var(--color-foreground-muted)" }}>
        <Loader2 size={16} className="animate-spin" />
        Loading subscription…
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: "720px" }}>
      <PlanCard subscription={subscription} />
      <UpgradePanel subscription={subscription} disabled={busyKey !== null} onCheckout={handleCheckout} />
      <CancelPanel subscription={subscription} disabled={busyKey !== null} onCancel={handleCancel} />
    </div>
  );
}
