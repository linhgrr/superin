/**
 * Command definitions — static command builders that don't need runtime state.
 */

import type { AppRuntimeEntry } from "@/types/generated";
import { applyTheme, persistTheme } from "@/lib/theme";
import { DynamicIcon } from "@/lib/icon-resolver";

export type CommandCategory = "apps" | "actions" | "settings" | "help";

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  shortcut?: string;
  category: CommandCategory;
  action: () => void;
  keywords: string[];
}

export const CATEGORY_ORDER: CommandCategory[] = ["apps", "actions", "settings", "help"];

export const CATEGORY_LABELS: Record<CommandCategory, string> = {
  apps: "Apps",
  actions: "Actions",
  settings: "Settings",
  help: "Help",
};

type NavigateFn = (path: string) => void;
type LogoutFn = () => void;

/**
 * Build the static commands (non-installed-app commands).
 * Installed-app commands are built in the component using installedApps.
 */
export function buildStaticCommands(
  navigate: NavigateFn,
  logout: LogoutFn,
  onOpenAddWidget: () => void,
  onOpenSettings: (tab: string) => void
): Omit<CommandItem, "id">[] {
  return [
    // ── Apps ──────────────────────────────────────────────────────────────────
    {
      id: "nav-dashboard",
      title: "Go to Dashboard",
      subtitle: "View your widgets and overview",
      icon: <DynamicIcon name="LayoutDashboard" size={18} />,
      shortcut: "G D",
      category: "apps",
      action: () => navigate("/dashboard"),
      keywords: ["dashboard", "home", "widgets", "overview"],
    },
    {
      id: "nav-store",
      title: "Go to App Store",
      subtitle: "Browse and install apps",
      icon: <DynamicIcon name="Store" size={18} />,
      shortcut: "G S",
      category: "apps",
      action: () => navigate("/store"),
      keywords: ["store", "apps", "install", "browse", "marketplace"],
    },
    // ── Actions ────────────────────────────────────────────────────────────────
    {
      id: "action-add-widget",
      title: "Add Widget",
      subtitle: "Add a new widget to your dashboard",
      icon: <DynamicIcon name="Plus" size={18} />,
      shortcut: "A W",
      category: "actions",
      action: () => {
        navigate("/dashboard");
        onOpenAddWidget();
      },
      keywords: ["add", "widget", "dashboard", "new"],
    },
    {
      id: "action-toggle-theme",
      title: "Toggle Theme",
      subtitle: "Switch between light and dark mode",
      icon: <DynamicIcon name="Moon" size={18} />,
      shortcut: "T T",
      category: "actions",
      action: () => {
        const isDark = document.documentElement.classList.contains("dark");
        const newTheme = isDark ? "light" : "dark";

        applyTheme(newTheme);
        persistTheme(newTheme);

        window.dispatchEvent(new CustomEvent("shin:theme-changed", { detail: newTheme }));
      },
      keywords: ["theme", "dark", "light", "mode", "toggle", "appearance"],
    },
    // ── Settings ───────────────────────────────────────────────────────────────
    {
      id: "settings",
      title: "Settings",
      subtitle: "Manage your preferences and account",
      icon: <DynamicIcon name="Settings" size={18} />,
      category: "settings",
      action: () => navigate("/settings"),
      keywords: ["settings", "preferences", "options", "configuration"],
    },
    {
      id: "settings-theme",
      title: "Theme Settings",
      subtitle: "Change appearance preferences",
      icon: <DynamicIcon name="Sun" size={18} />,
      category: "settings",
      action: () => {
        navigate("/settings");
        onOpenSettings("appearance");
      },
      keywords: ["settings", "theme", "appearance", "display", "preferences"],
    },
    {
      id: "settings-profile",
      title: "Profile Settings",
      subtitle: "Manage your account details",
      icon: <DynamicIcon name="User" size={18} />,
      category: "settings",
      action: () => {
        navigate("/settings");
        onOpenSettings("profile");
      },
      keywords: ["settings", "profile", "account", "personal"],
    },
    {
      id: "settings-logout",
      title: "Sign Out",
      subtitle: "Log out of your account",
      icon: <DynamicIcon name="LogOut" size={18} />,
      category: "settings",
      action: () => logout(),
      keywords: ["logout", "sign out", "exit", "account"],
    },
    // ── Help ──────────────────────────────────────────────────────────────────
    {
      id: "help-shortcuts",
      title: "Keyboard Shortcuts",
      subtitle: "View all available shortcuts",
      icon: <DynamicIcon name="Command" size={18} />,
      shortcut: "?",
      category: "help",
      action: () => {
        navigate("/settings");
        onOpenSettings("keyboard");
      },
      keywords: ["help", "shortcuts", "keyboard", "hotkeys", "commands"],
    },
  ];
}

/**
 * Build command items for each installed app.
 */
export function buildInstalledAppCommands(
  apps: AppRuntimeEntry[],
  navigate: NavigateFn
): CommandItem[] {
  return apps.map((app) => ({
    id: `app-${app.id}`,
    title: `Open ${app.name}`,
    subtitle: app.description,
    icon: app.icon ? (
      <DynamicIcon name={app.icon} size={18} />
    ) : (
      <DynamicIcon name="Sparkles" size={18} />
    ),
    category: "apps" as const,
    action: () => navigate(`/apps/${app.id}`),
    keywords: [app.name, app.category, app.description, "app"],
  }));
}
