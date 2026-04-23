/**
 * Settings constants — theme, density, timezone, and keyboard shortcut definitions.
 */

export type Theme = "light" | "dark" | "system";
export type Density = "comfortable" | "compact" | "spacious";

export interface SettingsState {
  theme: Theme;
  density: Density;
  animations: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  marketingEmails: boolean;
  timezone: string;
}

export const DEFAULT_SETTINGS: SettingsState = {
  theme: "system",
  density: "comfortable",
  animations: true,
  emailNotifications: true,
  pushNotifications: true,
  marketingEmails: false,
  timezone: "UTC",
};

export const TIMEZONES = [
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
  { value: "Asia/Kolkata", label: "Mumbai (GMT+5:30)" },
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
] as const;

export const KEYBOARD_SHORTCUTS = [
  {
    category: "Global",
    shortcuts: [
      { key: "G D", description: "Go to Dashboard" },
      { key: "G S", description: "Go to App Store" },
      { key: "A W", description: "Open Add Widget from anywhere" },
      { key: "T T", description: "Toggle Theme" },
      { key: "⌘ K / Ctrl K", description: "Open Command Palette" },
      { key: "?", description: "Show Keyboard Shortcuts" },
    ],
  },
  {
    category: "Command Palette",
    shortcuts: [
      { key: "↑ ↓", description: "Navigate command results" },
      { key: "↵", description: "Run selected command" },
      { key: "ESC", description: "Close command palette or modal" },
    ],
  },
] as const;
