/**
 * SettingsPage — user preferences and account settings.
 *
 * Architecture:
 *   SettingsPage
 *   ├── ProfileSection        (name, avatar, timezone)
 *   ├── AppearanceSection    (theme, density, animations)
 *   ├── NotificationsSection (email, push, marketing)
 *   └── KeyboardSection      (shortcuts reference)
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Keyboard, Palette, User } from "lucide-react";
import { STORAGE_KEYS } from "@/constants";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/providers/ToastProvider";
import { updateUserSettings } from "@/api/auth";
import {
  DEFAULT_SETTINGS,
  type SettingsState,
  type Theme,
} from "./settings-constants";
import ProfileSection from "./ProfileSection";
import AppearanceSection from "./AppearanceSection";
import NotificationsSection from "./NotificationsSection";
import KeyboardSection from "./KeyboardSection";

type TabId = "profile" | "appearance" | "notifications" | "keyboard";

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_TABS: TabId[] = ["profile", "appearance", "notifications", "keyboard"];

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "profile", label: "Profile", icon: <User size={18} /> },
  { id: "appearance", label: "Appearance", icon: <Palette size={18} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={18} /> },
  { id: "keyboard", label: "Keyboard", icon: <Keyboard size={18} /> },
];

const OPEN_SETTINGS_EVENT = "shin:open-settings";
const THEME_CHANGED_EVENT = "shin:theme-changed";

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [isSaving, setIsSaving] = useState(false);

  // Load from localStorage
  const [settings, setSettings] = useState<SettingsState>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  });

  // Sync timezone from user settings when available
  useEffect(() => {
    const timezone = user?.settings?.timezone;
    if (typeof timezone === "string" && timezone.length > 0) {
      setSettings((prev) => ({ ...prev, timezone }));
    }
  }, [user?.settings?.timezone]);

  // Apply theme to <html>
  useEffect(() => {
    const root = document.documentElement;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark =
      settings.theme === "dark" || (settings.theme === "system" && systemDark);
    root.classList.toggle("dark", isDark);
    root.classList.toggle("light", !isDark);
  }, [settings.theme]);

  // Listen for custom event to open a specific tab
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail as TabId;
      if (VALID_TABS.includes(tab)) {
        setActiveTab(tab);
      }
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, handler);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handler);
  }, []);

  // Listen for theme changes from other sources (Command Palette)
  useEffect(() => {
    const handler = (e: Event) => {
      setSettings((prev) => ({ ...prev, theme: (e as CustomEvent<string>).detail as Theme }));
    };
    window.addEventListener(THEME_CHANGED_EVENT, handler);
    return () => window.removeEventListener(THEME_CHANGED_EVENT, handler);
  }, []);

  // Cross-tab sync
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.USER_SETTINGS && e.newValue) {
        try {
          setSettings((prev) => ({ ...prev, ...JSON.parse(e.newValue!) }));
        } catch {
          toast.error("Failed to sync settings", {
            description: "Could not parse settings from another tab",
          });
        }
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [toast]);

  const saveSettings = useCallback(
    async (newSettings: Partial<SettingsState>) => {
      setIsSaving(true);
      const updated = { ...settings, ...newSettings };
      setSettings(updated);
      localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(updated));

      if (newSettings.timezone) {
        try {
          await updateUserSettings({ settings: { timezone: newSettings.timezone } });
        } catch {
          toast.error("Failed to sync timezone", {
            description: "Your timezone preference could not be saved to the server",
          });
        }
      }

      setIsSaving(false);
      toast.success("Settings saved", { description: "Your preferences have been updated" });
    },
    [settings, toast]
  );

  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/login");
  }, [logout, navigate]);

  const isTabActive = (id: TabId) => activeTab === id;

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", animation: "fadeIn 0.3s ease" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1.5rem",
            fontWeight: 600,
            color: "var(--color-foreground)",
            margin: 0,
          }}
        >
          Settings
        </h1>
        <p style={{ fontSize: "0.9375rem", color: "var(--color-foreground-muted)", marginTop: "0.375rem" }}>
          Manage your account preferences and workspace settings
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          marginBottom: "1.5rem",
          padding: "0.375rem",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          overflowX: "auto",
        }}
      >
        {TABS.map((tab) => {
          const active = isTabActive(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1rem",
                borderRadius: "10px",
                border: "none",
                background: active ? "var(--color-surface-elevated)" : "transparent",
                color: active ? "var(--color-primary)" : "var(--color-foreground-muted)",
                fontSize: "0.875rem",
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                transition: "background 0.15s ease, color 0.15s ease",
                whiteSpace: "nowrap",
                boxShadow: active ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "profile" && (
        <ProfileSection settings={settings} onSave={saveSettings} onLogout={handleLogout} />
      )}
      {activeTab === "appearance" && (
        <AppearanceSection settings={settings} onSave={saveSettings} />
      )}
      {activeTab === "notifications" && (
        <NotificationsSection settings={settings} onSave={saveSettings} />
      )}
      {activeTab === "keyboard" && <KeyboardSection />}

      {/* Saving indicator */}
      {isSaving && (
        <div
          style={{
            position: "fixed",
            bottom: "1.5rem",
            right: "1.5rem",
            padding: "0.75rem 1rem",
            background: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "10px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.875rem",
            color: "var(--color-foreground)",
            animation: "fadeInScale 0.2s ease",
          }}
        >
          <span className="animate-spin">⏳</span>
          Saving...
        </div>
      )}
    </div>
  );
}
