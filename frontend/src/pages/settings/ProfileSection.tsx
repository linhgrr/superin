/**
 * ProfileSection — user profile and timezone settings.
 */

import { type ChangeEvent, useCallback, useMemo, useRef, useState } from "react";
import Camera from "lucide-react/dist/esm/icons/camera";
import Globe from "lucide-react/dist/esm/icons/globe";
import LogOut from "lucide-react/dist/esm/icons/log-out";
import User from "lucide-react/dist/esm/icons/user";
import { uploadProfileAvatar } from "@/api/auth";
import { useToast } from "@/components/providers/ToastProvider";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmationModal } from "@/shared/components/ConfirmationModal";
import Section from "./Section";
import { TIMEZONES, type SettingsState } from "./settings-constants";

interface ProfileSectionProps {
  settings: SettingsState;
  onSave: (updates: Partial<SettingsState>) => void;
  onLogout: () => void;
}

export default function ProfileSection({
  settings,
  onSave,
  onLogout,
}: ProfileSectionProps) {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const initials = useMemo(() => {
    if (!user?.name) return "U";
    return user.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [user?.name]);

  const avatarUrl = typeof user?.avatar_url === "string" ? user.avatar_url : null;

  const handlePickAvatar = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleAvatarSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        toast.error("Invalid file type", {
          description: "Please select an image file.",
        });
        return;
      }

      const maxBytes = 5 * 1024 * 1024;
      if (file.size > maxBytes) {
        toast.error("Image too large", {
          description: "Max avatar size is 5MB.",
        });
        return;
      }

      setIsUploadingAvatar(true);
      try {
        await uploadProfileAvatar(file);
        await refreshUser();
        toast.success("Profile photo updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to upload profile photo.";
        toast.error("Upload failed", { description: message });
      } finally {
        setIsUploadingAvatar(false);
      }
    },
    [refreshUser, toast]
  );

  return (
    <Section
      icon={<User size={20} />}
      title="Profile"
      description="Manage your personal information and account details"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1.25rem",
          marginBottom: "1.5rem",
        }}
      >
        {/* Avatar */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={`${user?.name ?? "User"} profile`}
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "16px",
              objectFit: "cover",
              border: "1px solid var(--color-border)",
            }}
          />
        ) : (
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, var(--color-primary) 0%, oklch(0.65 0.21 320) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "white",
              fontFamily: "var(--font-display)",
            }}
          >
            {initials}
          </div>
        )}
        <div>
          <div style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--color-foreground)" }}>
            {user?.name || "User"}
          </div>
          <div style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)", marginTop: "0.25rem" }}>
            {user?.email || "user@example.com"}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handlePickAvatar}
            disabled={isUploadingAvatar}
            style={{ marginTop: "0.625rem", display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
          >
            <Camera size={14} />
            {isUploadingAvatar ? "Uploading…" : "Change photo"}
          </button>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              marginTop: "0.5rem",
              padding: "0.25rem 0.625rem",
              background: "oklch(0.95 0.05 145 / 0.15)",
              color: "var(--color-success)",
              borderRadius: "6px",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            Active
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleAvatarSelected}
          style={{ display: "none" }}
        />
      </div>

      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "1.25rem" }}>
        {/* Timezone */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label
            htmlFor="settings-timezone"
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
              id="settings-timezone"
              value={settings.timezone}
              onChange={(e) => onSave({ timezone: e.target.value })}
              style={{
                flex: 1,
                padding: "0.625rem 0.875rem",
                borderRadius: "10px",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-foreground)",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)", marginTop: "0.5rem" }}>
            Used for scheduling and AI time awareness
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="btn btn-danger"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
      {showLogoutConfirm ? (
        <ConfirmationModal
          title="Sign Out"
          message="You will be signed out of this workspace on this device."
          confirmLabel="Sign Out"
          cancelLabel="Stay Signed In"
          variant="danger"
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={() => {
            setShowLogoutConfirm(false);
            onLogout();
          }}
        />
      ) : null}
    </Section>
  );
}
