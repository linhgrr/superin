/**
 * Command Palette — Quick navigation and actions for power users.
 *
 * Extracted:
 * - CommandList: grouped + filtered list rendering
 * - CommandPalette: orchestration, keyboard handling, rendering
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { DynamicIcon } from "@/lib/icon-resolver";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import {
  buildStaticCommands,
  buildInstalledAppCommands,
  CATEGORY_ORDER,
  type CommandCategory,
  type CommandItem,
} from "./command-definitions";
import { STORAGE_KEYS } from "@/constants";

import { CommandList } from "./CommandList";

export type { CommandItem };

const MAX_RECENT = 5;

function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { installedApps } = useWorkspace();
  const { logout } = useAuth();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentCommands, setRecentCommands] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.RECENT_COMMANDS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Stable event dispatch
  const dispatchCustom = useCallback((event: CustomEvent) => {
    window.dispatchEvent(event);
  }, []);

  const openAddWidget = useCallback(() => {
    dispatchCustom(new CustomEvent("superin:open-add-widget"));
  }, [dispatchCustom]);

  const openSettings = useCallback((tab: string) => {
    dispatchCustom(new CustomEvent("superin:open-settings", { detail: tab }));
  }, [dispatchCustom]);

  // Build commands
  const commands = useMemo<CommandItem[]>(() => {
    const staticCmds = buildStaticCommands(navigate, logout, openAddWidget, openSettings);
    const appCmds = buildInstalledAppCommands(installedApps, navigate);
    return [...staticCmds, ...appCmds];
  }, [installedApps, navigate, logout, openAddWidget, openSettings]);

  // Filter by query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      const recent = recentCommands
        .map((id) => commands.find((c) => c.id === id))
        .filter(Boolean) as CommandItem[];
      const others = commands.filter((c) => !recentCommands.includes(c.id));
      return [...recent, ...others];
    }
    const lowerQuery = query.toLowerCase();
    return commands.filter((cmd) => {
      const searchText = [cmd.title, cmd.subtitle, ...cmd.keywords].join(" ").toLowerCase();
      return searchText.includes(lowerQuery);
    });
  }, [commands, query, recentCommands]);

  // Group by category
  const groupedDisplay = useMemo(() => {
    const groups: Partial<Record<CommandCategory, CommandItem[]>> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category]!.push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  // Flat list in category order
  const flatCommands = useMemo(() => {
    const flat: CommandItem[] = [];
    for (const cat of CATEGORY_ORDER) {
      const cmds = groupedDisplay[cat];
      if (cmds?.length) flat.push(...cmds);
    }
    return flat;
  }, [groupedDisplay]);

  const totalCount = flatCommands.length;

  // Reset selected index when list changes
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, totalCount - 1)));
  }, [query, totalCount]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Track recent commands — debounced to batch writes on rapid interactions
  const pendingRecent = useRef<string[] | null>(null);
  const trackRecent = useCallback(
    (id: string) => {
      const next = [id, ...recentCommands.filter((c) => c !== id)].slice(0, MAX_RECENT);
      setRecentCommands(next);
      pendingRecent.current = next;
    },
    [recentCommands]
  );

  // Flush pending recent commands to localStorage (debounced)
  useEffect(() => {
    if (pendingRecent.current === null) return;
    const toWrite = pendingRecent.current;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEYS.RECENT_COMMANDS, JSON.stringify(toWrite));
      } catch {
        // Non-critical
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [recentCommands]);

  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      trackRecent(cmd.id);
      cmd.action();
      onClose();
    },
    [onClose, trackRecent]
  );

  // Scroll selected into view
  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, totalCount - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = flatCommands[selectedIndex];
        if (cmd) executeCommand(cmd);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flatCommands, selectedIndex, executeCommand, onClose, totalCount]);

  // Stable index map for grouped rendering
  const commandIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const cat of CATEGORY_ORDER) {
      const cmds = groupedDisplay[cat];
      if (cmds?.length) {
        for (const cmd of cmds) map.set(cmd.id, idx++);
      }
    }
    return map;
  }, [groupedDisplay]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
        background: "oklch(0 0 0 / 0.6)",
        backdropFilter: "blur(8px)",
        animation: "fadeIn 0.15s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "600px",
          background: "linear-gradient(165deg, var(--color-surface) 0%, var(--color-surface-elevated) 100%)",
          border: "1px solid var(--color-border)",
          borderRadius: "16px",
          boxShadow: "0 24px 48px oklch(0 0 0 / 0.4), 0 0 0 1px var(--color-border)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "60vh",
          animation: "fadeInScale 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.875rem",
            padding: "1.75rem 2rem",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <DynamicIcon name="Search" size={22} style={{ color: "var(--color-foreground-muted)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--color-foreground)",
              fontSize: "1.0625rem",
              fontFamily: "var(--font-sans)",
              padding: "0.625rem 0.375rem",
              minHeight: "32px",
            }}
          />
          <kbd
            style={{
              padding: "0.25rem 0.5rem",
              background: "var(--color-surface-floating)",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              fontSize: "0.75rem",
              fontFamily: "var(--font-mono)",
              color: "var(--color-foreground-muted)",
              flexShrink: 0,
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
          <CommandList
            flatCommands={flatCommands}
            groupedDisplay={groupedDisplay}
            commandIndexMap={commandIndexMap}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            onExecute={executeCommand}
            itemRefs={itemRefs}
          />
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1rem",
            borderTop: "1px solid var(--color-border)",
            fontSize: "0.75rem",
            color: "var(--color-foreground-muted)",
          }}
        >
          <div style={{ display: "flex", gap: "1rem" }}>
            <span>
              <kbd style={{ padding: "0.125rem 0.25rem", background: "var(--color-surface-floating)", border: "1px solid var(--color-border)", borderRadius: "3px", fontFamily: "var(--font-mono)" }}>↑↓</kbd> to navigate
            </span>
            <span>
              <kbd style={{ padding: "0.125rem 0.25rem", background: "var(--color-surface-floating)", border: "1px solid var(--color-border)", borderRadius: "3px", fontFamily: "var(--font-mono)" }}>↵</kbd> to select
            </span>
          </div>
          <span>{totalCount} commands</span>
        </div>
      </div>
    </div>
  );
}

export { CommandPalette };