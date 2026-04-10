/**
 * CommandList — renders the grouped + filtered command list.
 */

import type { MutableRefObject } from "react";

import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type CommandCategory,
} from "./command-definitions";
import type { CommandItem as ExtractedCommandItem } from "./command-definitions";

interface CommandListProps {
  flatCommands: ExtractedCommandItem[];
  groupedDisplay: Partial<Record<CommandCategory, ExtractedCommandItem[]>>;
  commandIndexMap: Map<string, number>;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  onExecute: (cmd: ExtractedCommandItem) => void;
  itemRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
}

export function CommandList({
  flatCommands,
  groupedDisplay,
  commandIndexMap,
  selectedIndex,
  setSelectedIndex,
  onExecute,
  itemRefs,
}: CommandListProps) {
  if (flatCommands.length === 0) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-foreground-muted)" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: "1rem", opacity: 0.5 }}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <p style={{ fontSize: "0.9375rem", margin: 0 }}>No commands found</p>
        <p style={{ fontSize: "0.8125rem", marginTop: "0.5rem", opacity: 0.7 }}>Try a different search term</p>
      </div>
    );
  }

  return (
    <>
      {CATEGORY_ORDER.map((category) => {
        const cmds = groupedDisplay[category];
        if (!cmds?.length) return null;

        return (
          <div key={category} style={{ marginBottom: "0.5rem" }}>
            <div
              style={{
                padding: "0.5rem 0.75rem",
                fontSize: "0.6875rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-foreground-muted)",
              }}
            >
              {CATEGORY_LABELS[category]}
            </div>
            {cmds.map((cmd) => {
              const index = commandIndexMap.get(cmd.id)!;
              const isSelected = index === selectedIndex;

              return (
                <button
                  key={cmd.id}
                  ref={(el) => { itemRefs.current[index] = el; }}
                  onClick={() => onExecute(cmd)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.75rem",
                    borderRadius: "10px",
                    border: "none",
                    background: isSelected ? "var(--color-primary-muted)" : "transparent",
                    color: isSelected ? "var(--color-primary)" : "var(--color-foreground)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "8px",
                      background: isSelected ? "var(--color-primary)" : "var(--color-surface-floating)",
                      color: isSelected ? "var(--color-primary-foreground)" : "var(--color-foreground-muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {cmd.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.9375rem", fontWeight: isSelected ? 600 : 500, lineHeight: 1.3 }}>
                      {cmd.title}
                    </div>
                    {cmd.subtitle && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: isSelected ? "var(--color-primary)" : "var(--color-foreground-muted)",
                          opacity: isSelected ? 0.8 : 1,
                          lineHeight: 1.3,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cmd.subtitle}
                      </div>
                    )}
                  </div>
                  {cmd.shortcut ? (
                    <kbd
                      style={{
                        padding: "0.25rem 0.375rem",
                        background: isSelected ? "oklch(0.68 0.22 35 / 0.2)" : "var(--color-surface-floating)",
                        border: `1px solid ${isSelected ? "oklch(0.68 0.22 35 / 0.3)" : "var(--color-border)"}`,
                        borderRadius: "4px",
                        fontSize: "0.6875rem",
                        fontFamily: "var(--font-mono)",
                        color: isSelected ? "var(--color-primary)" : "var(--color-foreground-muted)",
                        flexShrink: 0,
                      }}
                    >
                      {cmd.shortcut}
                    </kbd>
                  ) : isSelected ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-primary)", flexShrink: 0 }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </div>
        );
      })}
    </>
  );
}