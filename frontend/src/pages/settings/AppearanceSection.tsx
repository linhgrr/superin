/**
 * AppearanceSection — theme, density, and animation settings.
 */

import { DynamicIcon } from "@/lib/icon-resolver";
import Section from "./Section";
import Select from "./Select";
import Toggle from "./Toggle";
import type { SettingsState } from "./settings-constants";

interface AppearanceSectionProps {
  settings: SettingsState;
  onSave: (updates: Partial<SettingsState>) => void;
}

// Static option arrays — stable references, no re-creation on render
const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: <DynamicIcon name="Sun" size={16} /> },
  { value: "dark" as const, label: "Dark", icon: <DynamicIcon name="Moon" size={16} /> },
  { value: "system" as const, label: "System", icon: <DynamicIcon name="Monitor" size={16} /> },
];

const DENSITY_OPTIONS = [
  { value: "compact" as const, label: "Compact" },
  { value: "comfortable" as const, label: "Comfortable" },
  { value: "spacious" as const, label: "Spacious" },
];

export default function AppearanceSection({ settings, onSave }: AppearanceSectionProps) {
  return (
    <Section
      icon={<DynamicIcon name="Palette" size={20} />}
      title="Appearance"
      description="Customize how Superin looks and feels"
    >
      <Select
        label="Theme"
        value={settings.theme}
        onChange={(theme) => onSave({ theme })}
        options={THEME_OPTIONS}
      />

      <Select
        label="Density"
        value={settings.density}
        onChange={(density) => onSave({ density })}
        options={DENSITY_OPTIONS}
      />

      <div style={{ marginTop: "1rem" }}>
        <Toggle
          checked={settings.animations}
          onChange={(animations) => onSave({ animations })}
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
        <strong style={{ color: "var(--color-foreground)" }}>Preview:</strong> Changes are
        applied immediately
      </div>
    </Section>
  );
}
