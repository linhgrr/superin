/**
 * Command Palette — Quick navigation and actions for power users.
 *
 * Extracted:
 * - CommandList: grouped + filtered list rendering
 * - CommandPalette: orchestration, keyboard handling, rendering
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ROUTES } from "@/constants/routes";
import { DynamicIcon } from "@/lib/icon-resolver";
import { useAuth } from "@/hooks/useAuth";
import { platformUiSelectors, usePlatformUiStore } from "@/stores/platform/platformUiStore";
import { settingsSelectors, useSettingsStore } from "@/stores/platform/settingsStore";
import type { SettingsTabId } from "@/stores/platform/settingsStore";
import { useInstalledApps } from "@/stores/platform/workspaceStore";
import {
  buildStaticCommands,
  buildInstalledAppCommands,
  CATEGORY_ORDER,
  type CommandCategory,
  type CommandItem,
} from "./command-definitions";

import { CommandList } from "./CommandList";

export type { CommandItem };

function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const installedApps = useInstalledApps();
  const { logout } = useAuth();
  const openAddWidgetDialog = usePlatformUiStore(platformUiSelectors.openAddWidgetDialog);
  const recentCommandIds = usePlatformUiStore(platformUiSelectors.recentCommandIds);
  const trackRecentCommand = usePlatformUiStore(platformUiSelectors.trackRecentCommand);
  const toggleTheme = useSettingsStore(settingsSelectors.toggleTheme);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const openAddWidget = useCallback(() => {
    openAddWidgetDialog();
  }, [openAddWidgetDialog]);

  const navigateSettings = useCallback((tab?: SettingsTabId) => {
    navigate(ROUTES.SETTINGS_TAB(tab));
  }, [navigate]);

  // Build commands
  const commands = useMemo<CommandItem[]>(() => {
    const staticCmds = buildStaticCommands(
      navigate,
      logout,
      openAddWidget,
      navigateSettings,
      toggleTheme
    );
    const appCmds = buildInstalledAppCommands(installedApps, navigate);
    return [...staticCmds, ...appCmds];
  }, [installedApps, navigate, logout, openAddWidget, navigateSettings, toggleTheme]);

  // Filter by query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      const recent = recentCommandIds
        .map((id) => commands.find((c) => c.id === id))
        .filter(Boolean) as CommandItem[];
      const others = commands.filter((c) => !recentCommandIds.includes(c.id));
      return [...recent, ...others];
    }
    const lowerQuery = query.toLowerCase();
    return commands.filter((cmd) => {
      const searchText = [cmd.title, cmd.subtitle, ...cmd.keywords].join(" ").toLowerCase();
      return searchText.includes(lowerQuery);
    });
  }, [commands, query, recentCommandIds]);

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

  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      trackRecentCommand(cmd.id);
      cmd.action();
      onClose();
    },
    [onClose, trackRecentCommand]
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
    >
      <button
        type="button"
        aria-label="Close command palette"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
        }}
      />
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
          position: "relative",
          zIndex: 1,
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
            name="command-search"
            aria-label="Search commands"
            placeholder="Search commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
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
