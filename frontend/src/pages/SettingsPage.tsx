/**
 * SettingsPage — User preferences and account settings
 *
 * Sections:
 * - Profile: Name, email, avatar
 * - Appearance: Theme, density, animations
 * - Notifications: Preferences
 * - Keyboard: Shortcuts reference
 */

import { useState, useEffect, useCallback } from "react";
import {
  User,
  Palette,
  Bell,
  Keyboard,
  Moon,
  Sun,
  Monitor,
  Check,
  Command,
  LogOut,
  Globe,
} from "lucide-react";
import { STORAGE_KEYS } from "@/constants";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/providers/ToastProvider";
import { updateUserSettings } from "@/api/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

type Theme = "light" | "dark" | "system";
type Density = "comfortable" | "compact" | "spacious";

interface SettingsState {
  theme: Theme;
  density: Density;
  animations: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  marketingEmails: boolean;
  timezone: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: SettingsState = {
  theme: "system",
  density: "comfortable",
  animations: true,
  emailNotifications: true,
  pushNotifications: true,
  marketingEmails: false,
  timezone: "UTC",
};

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh City (GMT+7)" },
  { value: "Asia/Bangkok", label: "Bangkok (GMT+7)" },
  { value: "Asia/Singapore", label: "Singapore (GMT+8)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (GMT+8)" },
  { value: "Asia/Tokyo", label: "Tokyo (GMT+9)" },
  { value: "Asia/Seoul", label: "Seoul (GMT+9)" },
  { value: "Asia/Shanghai", label: "Shanghai (GMT+8)" },
  { value: "Asia/Taipei", label: "Taipei (GMT+8)" },
  { value: "Asia/Jakarta", label: "Jakarta (GMT+7)" },
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (GMT+8)" },
  { value: "Asia/Manila", label: "Manila (GMT+8)" },
  { value: "Asia/Dubai", label: "Dubai (GMT+4)" },
  { value: "Asia/Mumbai", label: "Mumbai (GMT+5:30)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (GMT+1)" },
  { value: "Europe/Berlin", label: "Berlin (GMT+1)" },
  { value: "America/New_York", label: "New York (GMT-5)" },
  { value: "America/Los_Angeles", label: "Los Angeles (GMT-8)" },
  { value: "America/Chicago", label: "Chicago (GMT-6)" },
  { value: "America/Toronto", label: "Toronto (GMT-5)" },
  { value: "Australia/Sydney", label: "Sydney (GMT+11)" },
  { value: "Australia/Melbourne", label: "Melbourne (GMT+11)" },
  { value: "Pacific/Auckland", label: "Auckland (GMT+13)" },
];

const KEYBOARD_SHORTCUTS = [
  {
    category: "Navigation",
    shortcuts: [
      { key: "G D", description: "Go to Dashboard" },
      { key: "G S", description: "Go to App Store" },
      { key: "↑ ↓", description: "Navigate items" },
      { key: "↵", description: "Select / Open" },
    ],
  },
  {
    category: "Actions",
    shortcuts: [
      { key: "⌘ K / Ctrl K", description: "Open Command Palette" },
      { key: "A W", description: "Add Widget" },
      { key: "T T", description: "Toggle Theme" },
      { key: "?", description: "Show Keyboard Shortcuts" },
    ],
  },
  {
    category: "System",
    shortcuts: [
      { key: "ESC", description: "Close modal / Cancel" },
      { key: "⌘ Enter / Ctrl ↵", description: "Save / Confirm" },
    ],
  },
];

// ─── Components ───────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "linear-gradient(165deg, var(--color-surface) 0%, var(--color-surface-elevated) 100%)",
        border: "1px solid var(--color-border)",
        borderRadius: "16px",
        padding: "1.5rem",
        marginBottom: "1.5rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: description ? "0.5rem" : "1.25rem" }}>
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            background: "var(--color-primary-muted)",
            color: "var(--color-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <h2
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1.125rem",
            fontWeight: 600,
            color: "var(--color-foreground)",
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      {description && (
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--color-foreground-muted)",
            marginBottom: "1.25rem",
            marginTop: 0,
          }}
        >
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
      <div>
        <div style={{ fontSize: "0.9375rem", fontWeight: 500, color: "var(--color-foreground)" }}>{label}</div>
        {description && (
          <div style={{ fontSize: "0.8125rem", color: "var(--color-foreground-muted)", marginTop: "0.25rem" }}>
            {description}
          </div>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: "48px",
          height: "26px",
          borderRadius: "13px",
          border: "none",
          background: checked ? "var(--color-primary)" : "var(--color-border)",
          position: "relative",
          cursor: "pointer",
          transition: "background 0.2s ease",
        }}
      >
        <div
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            background: "white",
            position: "absolute",
            top: "2px",
            left: checked ? "calc(100% - 24px)" : "2px",
            transition: "left 0.2s ease",
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          }}
        />
      </button>
    </div>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  label: string;
}) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label
        style={{
          display: "block",
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "var(--color-foreground-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "0.5rem",
        }}
      >
        {label}
      </label>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.625rem 1rem",
              borderRadius: "10px",
              border: "1px solid",
              borderColor: value === opt.value ? "var(--color-primary)" : "var(--color-border)",
              background: value === opt.value ? "var(--color-primary-muted)" : "var(--color-surface)",
              color: value === opt.value ? "var(--color-primary)" : "var(--color-foreground)",
              fontSize: "0.875rem",
              fontWeight: value === opt.value ? 600 : 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"profile" | "appearance" | "notifications" | "keyboard">("profile");
  const [isSaving, setIsSaving] = useState(false);

  // Listen for custom event to switch tabs
  useEffect(() => {
    const handleOpenSettings = (e: CustomEvent<string>) => {
      const tab = e.detail as typeof activeTab;
      if (["profile", "appearance", "notifications", "keyboard"].includes(tab)) {
        setActiveTab(tab);
      }
    };

    window.addEventListener("shin:open-settings", handleOpenSettings as EventListener);
    return () => window.removeEventListener("shin:open-settings", handleOpenSettings as EventListener);
  }, []);

  // Load settings from localStorage
  const [settings, setSettings] = useState<SettingsState>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  });

  // Sync timezone from user settings when available
  useEffect(() => {
    if (user?.settings?.timezone) {
      setSettings((prev) => ({ ...prev, timezone: user.settings.timezone }));
    }
  }, [user?.settings?.timezone]);
  useEffect(() => {
    const root = document.documentElement;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    if (settings.theme === "dark" || (settings.theme === "system" && systemDark)) {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
    }
  }, [settings.theme]);

  // Listen for theme changes from other sources (e.g., Command Palette)
  useEffect(() => {
    const handleThemeChange = (e: CustomEvent<string>) => {
      const newTheme = e.detail as Theme;
      setSettings((prev) => ({ ...prev, theme: newTheme }));
    };

    window.addEventListener("shin:theme-changed", handleThemeChange as EventListener);
    return () => window.removeEventListener("shin:theme-changed", handleThemeChange as EventListener);
  }, []);

  // Cross-tab sync: listen for storage changes from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.USER_SETTINGS && e.newValue) {
        try {
          const newSettings = JSON.parse(e.newValue);
          setSettings((prev) => ({ ...prev, ...newSettings }));
        } catch (error: unknown) {
          console.error("Failed to parse settings from storage event", error);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Save settings
  const saveSettings = useCallback(
    async (newSettings: Partial<SettingsState>) => {
      setIsSaving(true);
      const updated = { ...settings, ...newSettings };
      setSettings(updated);
      localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(updated));

      // Sync timezone to backend if changed
      if (newSettings.timezone) {
        try {
          await updateUserSettings({ settings: { timezone: newSettings.timezone } });
        } catch (error: unknown) {
          console.error("Failed to sync timezone setting to backend", error);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
      setIsSaving(false);
      toast.success("Settings saved", { description: "Your preferences have been updated" });
    },
    [settings, toast]
  );

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  // ─── Profile Section ──────────────────────────────────────────────────────────
  const ProfileSection = () => (
    <Section icon={<User size={20} />} title="Profile" description="Manage your personal information and account details">
      <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", marginBottom: "1.5rem" }}>
        <div
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "16px",
            background: "linear-gradient(135deg, var(--color-primary) 0%, oklch(0.72 0.24 45) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "white",
            fontFamily: "var(--font-display)",
          }}
        >
          {user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U"}
        </div>
        <div>
          <div style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--color-foreground)" }}>
            {user?.name || "User"}
          </div>
          <div style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)", marginTop: "0.25rem" }}>
            {user?.email || "user@example.com"}
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              marginTop: "0.5rem",
              padding: "0.25rem 0.625rem",
              background: "var(--color-success-muted, oklch(0.95 0.05 145))",
              color: "var(--color-success)",
              borderRadius: "6px",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            <Check size={12} />
            Active
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "1.25rem" }}>
        {/* Timezone Selector */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--color-foreground-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.5rem",
            }}
          >
            Timezone
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "var(--color-primary-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-primary)",
                flexShrink: 0,
              }}
            >
              <Globe size={20} />
            </div>
            <select
              value={settings.timezone}
              onChange={(e) => saveSettings({ timezone: e.target.value })}
              style={{
                flex: 1,
                padding: "0.625rem 0.875rem",
                borderRadius: "10px",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-foreground)",
                fontSize: "0.875rem",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginTop: "0.5rem" }}>
            Used for scheduling and AI time awareness
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="btn btn-danger"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </Section>
  );

  // ─── Appearance Section ───────────────────────────────────────────────────────
  const AppearanceSection = () => (
    <Section icon={<Palette size={20} />} title="Appearance" description="Customize how Shin looks and feels">
      <Select
        label="Theme"
        value={settings.theme}
        onChange={(theme) => saveSettings({ theme })}
        options={[
          { value: "light", label: "Light", icon: <Sun size={16} /> },
          { value: "dark", label: "Dark", icon: <Moon size={16} /> },
          { value: "system", label: "System", icon: <Monitor size={16} /> },
        ]}
      />

      <Select
        label="Density"
        value={settings.density}
        onChange={(density) => saveSettings({ density })}
        options={[
          { value: "compact", label: "Compact" },
          { value: "comfortable", label: "Comfortable" },
          { value: "spacious", label: "Spacious" },
        ]}
      />

      <div style={{ marginTop: "1rem" }}>
        <Toggle
          checked={settings.animations}
          onChange={(animations) => saveSettings({ animations })}
          label="Enable animations"
          description="Show transitions and motion effects throughout the app"
        />
      </div>

      <div
        style={{
          marginTop: "1.25rem",
          padding: "1rem",
          background: "var(--color-surface-floating)",
          borderRadius: "12px",
          fontSize: "0.8125rem",
          color: "var(--color-foreground-muted)",
        }}
      >
        <strong style={{ color: "var(--color-foreground)" }}>Preview:</strong> Changes are applied immediately
      </div>
    </Section>
  );

  // ─── Notifications Section ──────────────────────────────────────────────────────
  const NotificationsSection = () => (
    <Section icon={<Bell size={20} />} title="Notifications" description="Choose what you want to be notified about">
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <Toggle
          checked={settings.emailNotifications}
          onChange={(emailNotifications) => saveSettings({ emailNotifications })}
          label="Email notifications"
          description="Receive updates about your account, new features, and security alerts"
        />
        <Toggle
          checked={settings.pushNotifications}
          onChange={(pushNotifications) => saveSettings({ pushNotifications })}
          label="Push notifications"
          description="Browser notifications for important events and reminders"
        />
        <Toggle
          checked={settings.marketingEmails}
          onChange={(marketingEmails) => saveSettings({ marketingEmails })}
          label="Marketing emails"
          description="Tips, feature announcements, and promotional content"
        />
      </div>
    </Section>
  );

  // ─── Keyboard Section ─────────────────────────────────────────────────────────
  const KeyboardSection = () => (
    <Section icon={<Keyboard size={20} />} title="Keyboard Shortcuts" description="Quick reference for all keyboard commands">
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {KEYBOARD_SHORTCUTS.map((group) => (
          <div key={group.category}>
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
                    background: "var(--color-surface-floating)",
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
          background: "var(--color-primary-muted)",
          borderRadius: "10px",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <Command size={18} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
        <div style={{ fontSize: "0.875rem", color: "var(--color-foreground)" }}>
          <strong>Pro tip:</strong> Press <kbd style={{ padding: "0.125rem 0.375rem", background: "var(--color-surface)", borderRadius: "4px", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>?</kbd> anywhere to open this reference
        </div>
      </div>
    </Section>
  );

  // ─── Tabs ─────────────────────────────────────────────────────────────────────
  const tabs = [
    { id: "profile", label: "Profile", icon: <User size={18} /> },
    { id: "appearance", label: "Appearance", icon: <Palette size={18} /> },
    { id: "notifications", label: "Notifications", icon: <Bell size={18} /> },
    { id: "keyboard", label: "Keyboard", icon: <Keyboard size={18} /> },
  ] as const;

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", animation: "fadeIn 0.3s ease" }}>
      {/* Page header */}
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
        {tabs.map((tab) => (
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
              background: activeTab === tab.id ? "var(--color-surface-elevated)" : "transparent",
              color: activeTab === tab.id ? "var(--color-primary)" : "var(--color-foreground-muted)",
              fontSize: "0.875rem",
              fontWeight: activeTab === tab.id ? 600 : 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
              boxShadow: activeTab === tab.id ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "profile" && <ProfileSection />}
      {activeTab === "appearance" && <AppearanceSection />}
      {activeTab === "notifications" && <NotificationsSection />}
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
