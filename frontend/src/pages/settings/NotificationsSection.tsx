/**
 * NotificationsSection — email, push, and marketing notification preferences.
 */

import { DynamicIcon } from "@/lib/icon-resolver";
import Section from "./Section";
import Toggle from "./Toggle";
import type { SettingsState } from "./settings-constants";

interface NotificationsSectionProps {
  settings: SettingsState;
  onSave: (updates: Partial<SettingsState>) => void;
}

export default function NotificationsSection({
  settings,
  onSave,
}: NotificationsSectionProps) {
  return (
    <Section
      icon={<DynamicIcon name="Bell" size={20} />}
      title="Notifications"
      description="Choose what you want to be notified about"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <Toggle
          checked={settings.emailNotifications}
          onChange={(emailNotifications) => onSave({ emailNotifications })}
          label="Email notifications"
          description="Receive updates about your account, new features, and security alerts"
        />
        <Toggle
          checked={settings.pushNotifications}
          onChange={(pushNotifications) => onSave({ pushNotifications })}
          label="Push notifications"
          description="Browser notifications for important events and reminders"
        />
        <Toggle
          checked={settings.marketingEmails}
          onChange={(marketingEmails) => onSave({ marketingEmails })}
          label="Marketing emails"
          description="Tips, feature announcements, and promotional content"
        />
      </div>
    </Section>
  );
}
