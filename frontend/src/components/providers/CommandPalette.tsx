/**
 * Command Palette — Quick navigation and actions for power users
 *
 * Features:
 * - Cmd/Ctrl + K to open
 * - Search apps, actions, settings
 * - Recent commands tracking
 * - Keyboard navigation (arrow keys, Enter, Escape)
 * - Categories: Apps, Actions, Settings, Help
 *
 * Usage: Press Cmd/Ctrl + K anywhere in the app
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Command,
  LayoutDashboard,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Store,
  Sun,
  User,
} from "lucide-react";
import { STORAGE_KEYS } from "@/constants";
import { useAuth } from "@/hooks/useAuth";
import { DynamicIcon } from "@/lib/icon-resolver";
import { useWorkspace } from "./WorkspaceProvider";

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  shortcut?: string;
  category: "apps" | "actions" | "settings" | "help";
  action: () => void;
  keywords: string[];
}

const CATEGORY_ORDER = ["apps", "actions", "settings", "help"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  apps: "Apps",
  actions: "Actions",
  settings: "Settings",
  help: "Help",
};

function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { installedApps } = useWorkspace();
  const { logout } = useAuth();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentCommands, setRecentCommands] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.RECENT_COMMANDS);
    return saved ? JSON.parse(saved) : [];
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Build commands list
  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      // Apps
      {
        id: "nav-dashboard",
        title: "Go to Dashboard",
        subtitle: "View your widgets and overview",
        icon: <LayoutDashboard size={18} />,
        shortcut: "G D",
        category: "apps",
        action: () => navigate("/dashboard"),
        keywords: ["dashboard", "home", "widgets", "overview"],
      },
      {
        id: "nav-store",
        title: "Go to App Store",
        subtitle: "Browse and install apps",
        icon: <Store size={18} />,
        shortcut: "G S",
        category: "apps",
        action: () => navigate("/store"),
        keywords: ["store", "apps", "install", "browse", "marketplace"],
      },
      // Installed apps
      ...installedApps.map((app) => ({
        id: `app-${app.id}`,
        title: `Open ${app.name}`,
        subtitle: app.description,
        icon: app.icon ? (
          <DynamicIcon name={app.icon} size={18} />
        ) : (
          <Sparkles size={18} />
        ),
        category: "apps" as const,
        action: () => navigate(`/apps/${app.id}`),
        keywords: [app.name, app.category, app.description, "app"],
      })),
      // Actions
      {
        id: "action-add-widget",
        title: "Add Widget",
        subtitle: "Add a new widget to your dashboard",
        icon: <Plus size={18} />,
        shortcut: "A W",
        category: "actions",
        action: () => {
          navigate("/dashboard");
          // Dispatch custom event for DashboardPage to listen
          window.dispatchEvent(new CustomEvent("shin:open-add-widget"));
        },
        keywords: ["add", "widget", "dashboard", "new"],
      },
      {
        id: "action-toggle-theme",
        title: "Toggle Theme",
        subtitle: "Switch between light and dark mode",
        icon: <Moon size={18} />,
        shortcut: "T T",
        category: "actions",
        action: () => {
          const root = document.documentElement;
          const isDark = root.classList.contains("dark");
          const newTheme = isDark ? "light" : "dark";

          // Apply to DOM
          if (isDark) {
            root.classList.remove("dark");
            root.classList.add("light");
          } else {
            root.classList.remove("light");
            root.classList.add("dark");
          }

          // Sync to localStorage so SettingsPage reflects the change
          const saved = localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
          if (saved) {
            try {
              const settings = JSON.parse(saved);
              settings.theme = newTheme;
              localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(settings));
            } catch (error: unknown) {
              console.error("Failed to update stored user settings", error);
            }
          } else {
            // No existing settings, create minimal one
            localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify({ theme: newTheme }));
          }

          // Notify any open SettingsPage to re-sync
          window.dispatchEvent(new CustomEvent("shin:theme-changed", { detail: newTheme }));
        },
        keywords: ["theme", "dark", "light", "mode", "toggle", "appearance"],
      },
      // Settings
      {
        id: "settings",
        title: "Settings",
        subtitle: "Manage your preferences and account",
        icon: <Settings size={18} />,
        category: "settings",
        action: () => navigate("/settings"),
        keywords: ["settings", "preferences", "options", "configuration"],
      },
      {
        id: "settings-theme",
        title: "Theme Settings",
        subtitle: "Change appearance preferences",
        icon: <Sun size={18} />,
        category: "settings",
        action: () => {
          navigate("/settings");
          window.dispatchEvent(new CustomEvent("shin:open-settings", { detail: "appearance" }));
        },
        keywords: ["settings", "theme", "appearance", "display", "preferences"],
      },
      {
        id: "settings-profile",
        title: "Profile Settings",
        subtitle: "Manage your account details",
        icon: <User size={18} />,
        category: "settings",
        action: () => {
          navigate("/settings");
          window.dispatchEvent(new CustomEvent("shin:open-settings", { detail: "profile" }));
        },
        keywords: ["settings", "profile", "account", "personal"],
      },
      {
        id: "settings-logout",
        title: "Sign Out",
        subtitle: "Log out of your account",
        icon: <LogOut size={18} />,
        category: "settings",
        action: () => logout(),
        keywords: ["logout", "sign out", "exit", "account"],
      },
      // Help
      {
        id: "help-shortcuts",
        title: "Keyboard Shortcuts",
        subtitle: "View all available shortcuts",
        icon: <Command size={18} />,
        shortcut: "?",
        category: "help",
        action: () => {
          navigate("/settings");
          window.dispatchEvent(new CustomEvent("shin:open-settings", { detail: "keyboard" }));
        },
        keywords: ["help", "shortcuts", "keyboard", "hotkeys", "commands"],
      },
    ];

    return items;
  }, [installedApps, navigate, logout]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      // Show recent commands first, then all
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
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  // Build flat commands list and grouped display data
  const { flatCommands, groupedDisplay, totalCount } = useMemo(() => {
    const flat: CommandItem[] = [];
    const grouped: Record<string, CommandItem[]> = {};

    for (const category of CATEGORY_ORDER) {
      const cmds = groupedCommands[category];
      if (cmds?.length) {
        grouped[category] = cmds;
        flat.push(...cmds.map((cmd) => ({ ...cmd, __category: category })));
      }
    }

    return { flatCommands: flat, groupedDisplay: grouped, totalCount: flat.length };
  }, [groupedCommands]);

  // Reset selected index when query changes or list shrinks
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, totalCount - 1)));
  }, [query, totalCount]);

  // Clamp selected index if list shrinks
  useEffect(() => {
    if (selectedIndex >= totalCount) {
      setSelectedIndex(Math.max(0, totalCount - 1));
    }
  }, [selectedIndex, totalCount]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Track recent commands
  const trackRecent = useCallback(
    (id: string) => {
      const next = [id, ...recentCommands.filter((c) => c !== id)].slice(0, 5);
      setRecentCommands(next);
      localStorage.setItem(STORAGE_KEYS.RECENT_COMMANDS, JSON.stringify(next));
    },
    [recentCommands]
  );

  // Execute command
  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      trackRecent(cmd.id);
      cmd.action();
      onClose();
    },
    [onClose, trackRecent]
  );

  // Keyboard navigation - stable effect, no re-attaches
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

  // Scroll selected into view
  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  // Create stable index lookup for grouped rendering
  const commandIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const category of CATEGORY_ORDER) {
      const cmds = groupedDisplay[category];
      if (cmds?.length) {
        for (const cmd of cmds) {
          map.set(cmd.id, idx++);
        }
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
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
          <Search size={22} style={{ color: "var(--color-foreground-muted)", flexShrink: 0 }} />
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
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0.5rem",
          }}
        >
          {flatCommands.length === 0 ? (
            <div
              style={{
                padding: "3rem",
                textAlign: "center",
                color: "var(--color-foreground-muted)",
              }}
            >
              <Search size={48} style={{ marginBottom: "1rem", opacity: 0.5 }} />
              <p style={{ fontSize: "0.9375rem", margin: 0 }}>No commands found</p>
              <p style={{ fontSize: "0.8125rem", marginTop: "0.5rem", opacity: 0.7 }}>
                Try a different search term
              </p>
            </div>
          ) : (
            categoryOrder.map((category) => {
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
                        onClick={() => executeCommand(cmd)}
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
                            background: isSelected
                              ? "var(--color-primary)"
                              : "var(--color-surface-floating)",
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
                          <div
                            style={{
                              fontSize: "0.9375rem",
                              fontWeight: isSelected ? 600 : 500,
                              lineHeight: 1.3,
                            }}
                          >
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
                              background: isSelected
                                ? "oklch(0.68 0.22 35 / 0.2)"
                                : "var(--color-surface-floating)",
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
                        ) : (
                          isSelected && (
                            <ChevronRight
                              size={16}
                              style={{
                                color: "var(--color-primary)",
                                flexShrink: 0,
                              }}
                            />
                          )
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
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
              <kbd
                style={{
                  padding: "0.125rem 0.25rem",
                  background: "var(--color-surface-floating)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "3px",
                  fontFamily: "var(--font-mono)",
                }}
              >
                ↑↓
              </kbd>{" "}
              to navigate
            </span>
            <span>
              <kbd
                style={{
                  padding: "0.125rem 0.25rem",
                  background: "var(--color-surface-floating)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "3px",
                  fontFamily: "var(--font-mono)",
                }}
              >
                ↵
              </kbd>{" "}
              to select
            </span>
          </div>
          <span>{flatCommands.length} commands</span>
        </div>
      </div>
    </div>
  );
}

export { CommandPalette };
export type { CommandItem };
