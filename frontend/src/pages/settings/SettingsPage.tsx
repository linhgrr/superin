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

import { useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DynamicIcon } from "@/lib/icon-resolver";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/providers/ToastProvider";
import type { SettingsState } from "./settings-constants";
import ProfileSection from "./ProfileSection";
import AppearanceSection from "./AppearanceSection";
import NotificationsSection from "./NotificationsSection";
import KeyboardSection from "./KeyboardSection";
import { settingsSelectors, useSettingsStore } from "@/stores/platform/settingsStore";
import type { SettingsTabId } from "@/stores/platform/settingsStore";

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { id: SettingsTabId; label: string; icon: React.ReactNode }[] = [
  { id: "profile", label: "Profile", icon: <DynamicIcon name="User" size={18} /> },
  { id: "appearance", label: "Appearance", icon: <DynamicIcon name="Palette" size={18} /> },
  { id: "notifications", label: "Notifications", icon: <DynamicIcon name="Bell" size={18} /> },
  { id: "keyboard", label: "Keyboard", icon: <DynamicIcon name="Keyboard" size={18} /> },
];

const DEFAULT_SETTINGS_TAB: SettingsTabId = "profile";

function isSettingsTabId(value: string | null): value is SettingsTabId {
  return TABS.some((tab) => tab.id === value);
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const isSaving = useSettingsStore(settingsSelectors.isSaving);
  const saveSettings = useSettingsStore(settingsSelectors.saveSettings);
  const settings = useSettingsStore(settingsSelectors.settings);
  const syncTimezoneFromUser = useSettingsStore(settingsSelectors.syncTimezoneFromUser);
  const activeTabParam = searchParams.get("tab");
  const activeTab = isSettingsTabId(activeTabParam) ? activeTabParam : DEFAULT_SETTINGS_TAB;

  // Sync timezone from user settings when available
  useEffect(() => {
    syncTimezoneFromUser(user?.settings?.timezone);
  }, [syncTimezoneFromUser, user?.settings?.timezone]);

  const handleSave = useCallback(
    (updates: Partial<SettingsState>) => {
      void saveSettings(updates).then(({ serverSyncFailed, timezoneSynced }) => {
        if (updates.timezone && !timezoneSynced) {
          toast.error("Failed to sync timezone", {
            description: "Your timezone preference could not be saved to the server",
          });
          return;
        }

        if (serverSyncFailed) {
          toast.warning("Settings saved locally", {
            description: "Some preferences could not be synced to the server",
          });
          return;
        }

        toast.success("Settings saved", {
          description: "Your preferences have been updated",
        });
      });
    },
    [saveSettings, toast]
  );

  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/login");
  }, [logout, navigate]);

  const handleTabChange = useCallback(
    (tab: SettingsTabId) => {
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);

        if (tab === DEFAULT_SETTINGS_TAB) {
          nextParams.delete("tab");
        } else {
          nextParams.set("tab", tab);
        }

        return nextParams;
      }, { replace: true });
    },
    [setSearchParams]
  );

  const isTabActive = (id: SettingsTabId) => activeTab === id;

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
              onClick={() => handleTabChange(tab.id)}
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
        <ProfileSection settings={settings} onSave={handleSave} onLogout={handleLogout} />
      )}
      {activeTab === "appearance" && (
        <AppearanceSection settings={settings} onSave={handleSave} />
      )}
      {activeTab === "notifications" && (
        <NotificationsSection settings={settings} onSave={handleSave} />
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
