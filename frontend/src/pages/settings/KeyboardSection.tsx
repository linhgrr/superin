/**
 * KeyboardSection — keyboard shortcuts reference.
 */

import { DynamicIcon } from "@/lib/icon-resolver";
import Section from "./Section";
import { KEYBOARD_SHORTCUTS } from "./settings-constants";

export default function KeyboardSection() {
  return (
    <Section
      icon={<DynamicIcon name="Keyboard" size={20} />}
      title="Keyboard Shortcuts"
      description="Verified shortcuts you can actually use in the current app"
    >
      <div
        style={{
          marginBottom: "1.25rem",
          padding: "1rem 1.125rem",
          background: "linear-gradient(135deg, var(--color-primary-muted) 0%, var(--color-surface-floating) 100%)",
          border: "1px solid oklch(from var(--color-primary) l c h / 0.18)",
          borderRadius: "12px",
          display: "grid",
          gap: "0.375rem",
        }}
      >
        <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-primary)" }}>
          Active now
        </div>
        <div style={{ fontSize: "0.9375rem", color: "var(--color-foreground)", lineHeight: 1.5 }}>
          Shortcuts trigger globally unless you are typing in an input, textarea, or editable field.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {KEYBOARD_SHORTCUTS.map((group) => (
          <div
            key={group.category}
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "14px",
              background: "var(--color-surface-floating)",
              padding: "1rem",
            }}
          >
            <h3
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--color-foreground-muted)",
                marginBottom: "0.75rem",
              }}
            >
              {group.category}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {group.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.625rem 0.75rem",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border-subtle, var(--color-border))",
                    borderRadius: "8px",
                  }}
                >
                  <span style={{ fontSize: "0.875rem", color: "var(--color-foreground)" }}>
                    {shortcut.description}
                  </span>
                  <kbd
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      padding: "0.25rem 0.5rem",
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "6px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.75rem",
                      color: "var(--color-foreground-muted)",
                    }}
                  >
                    {shortcut.key.split(" ").map((k, i) => (
                      <span key={i} style={{ display: "flex", alignItems: "center" }}>
                        {i > 0 && <span style={{ margin: "0 0.25rem" }}>+</span>}
                        {k}
                      </span>
                    ))}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: "1.5rem",
          padding: "1rem",
          background: "var(--color-surface-floating)",
          border: "1px solid var(--color-border)",
          borderRadius: "10px",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
        }}
      >
        <DynamicIcon name="Command" size={18} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
        <div style={{ fontSize: "0.875rem", color: "var(--color-foreground)" }}>
          <strong>Pro tip:</strong> Press{" "}
          <kbd
            style={{
              padding: "0.125rem 0.375rem",
              background: "var(--color-surface)",
              borderRadius: "4px",
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
            }}
          >
            ?
          </kbd>{" "}
          anywhere outside text inputs to open this reference instantly.
        </div>
      </div>
    </Section>
  );
}
