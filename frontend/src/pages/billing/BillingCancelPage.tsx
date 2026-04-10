export default function BillingCancelPage() {
  return (
    <div className="widget-card" style={{ maxWidth: "560px" }}>
      <div className="widget-card-title">Payment Cancelled</div>
      <p style={{ margin: 0, color: "var(--color-foreground-muted)" }}>
        Checkout was cancelled. No changes were made to your subscription.
      </p>
    </div>
  );
}
