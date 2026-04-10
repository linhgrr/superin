export default function BillingSuccessPage() {
  return (
    <div className="widget-card" style={{ maxWidth: "560px" }}>
      <div className="widget-card-title">Payment Success</div>
      <p style={{ margin: 0, color: "var(--color-foreground-muted)" }}>
        Payment completed. Your subscription will be updated after webhook confirmation.
      </p>
    </div>
  );
}
