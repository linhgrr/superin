import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useOnboarding } from "@/components/providers/onboarding/OnboardingProvider";
import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/hooks/useAuth";
import { useClickOutside } from "@/hooks/useClickOutside";
import { DynamicIcon } from "@/lib/icon-resolver";

const dropdownStyles = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  background: "var(--color-surface-elevated)",
  border: "1px solid var(--color-border)",
  borderRadius: "12px",
  padding: "0.5rem",
  minWidth: "180px",
  boxShadow: "0 8px 32px oklch(0 0 0 / 0.3)",
  zIndex: 1000,
  animation: "fadeInScale 0.15s ease",
} as const;

const menuButtonStyles = {
  width: "100%",
  justifyContent: "flex-start",
  background: "transparent",
  color: "var(--color-foreground)",
  padding: "0.5rem 0.75rem",
  fontSize: "0.8125rem",
  borderRadius: "8px",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
} as const;

export function TourMenu() {
  const { startTour, resetTours, isCompleted } = useOnboarding();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => setIsOpen(false), isOpen);

  const tours = useMemo(
    () => [
      { id: "welcome" as const, label: "Welcome Tour", icon: "HelpCircle" },
      { id: "dashboard" as const, label: "Dashboard Tour", icon: "PlayCircle" },
      { id: "apps" as const, label: "Apps Tour", icon: "PlayCircle" },
      { id: "chat" as const, label: "Chat Tour", icon: "PlayCircle" },
      { id: "store" as const, label: "Store Tour", icon: "PlayCircle" },
    ],
    [],
  );

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        onClick={() => setIsOpen((value) => !value)}
        title="Start Tour"
        aria-label="Start guided tour"
      >
        <DynamicIcon name="HelpCircle" size={16} />
      </button>

      {isOpen ? (
        <div style={dropdownStyles}>
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
            Guided Tours
          </div>
          {tours.map((tour) => (
            <button
              key={tour.id}
              className="btn"
              onClick={() => {
                startTour(tour.id);
                setIsOpen(false);
              }}
              style={menuButtonStyles}
            >
              <DynamicIcon name={tour.icon} size={14} />
              <span style={{ flex: 1 }}>{tour.label}</span>
              {isCompleted(tour.id) ? (
                <span style={{ fontSize: "0.625rem", color: "var(--color-success)" }}>✓</span>
              ) : null}
            </button>
          ))}
          <div style={{ borderTop: "1px solid var(--color-border)", margin: "0.5rem 0" }} />
          <button
            className="btn"
            onClick={() => {
              resetTours();
              setIsOpen(false);
            }}
            style={{
              ...menuButtonStyles,
              color: "var(--color-foreground-muted)",
            }}
          >
            Reset All Tours
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside(userMenuRef, () => setShowUserMenu(false), showUserMenu);

  const avatarUrl =
    typeof user?.avatar_url === "string" && user.avatar_url.trim().length > 0
      ? user.avatar_url
      : null;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl]);

  if (!user) return null;

  const userInitials =
    user.name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "";
  const showAvatarImage = Boolean(avatarUrl && !avatarLoadFailed);

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.LOGIN);
  };

  return (
    <div ref={userMenuRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        onClick={() => setShowUserMenu((value) => !value)}
        title={user.name ?? "User"}
        aria-label={showUserMenu ? "Close user menu" : "Open user menu"}
      >
        {showAvatarImage ? (
          <img
            src={avatarUrl!}
            alt={`${user.name ?? "User"} avatar`}
            width="32"
            height="32"
            onError={() => setAvatarLoadFailed(true)}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              objectFit: "cover",
              border: "1px solid var(--color-border)",
            }}
          />
        ) : (
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, var(--color-primary) 0%, oklch(0.72 0.24 45) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "white",
              fontFamily: "var(--font-display)",
            }}
          >
            {userInitials}
          </div>
        )}
      </button>

      {showUserMenu ? (
        <div style={dropdownStyles}>
          <div
            style={{
              padding: "0.75rem",
              borderBottom: "1px solid var(--color-border)",
              marginBottom: "0.5rem",
            }}
          >
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-foreground)" }}>
              {user.name}
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--color-foreground-muted)",
                marginTop: "0.25rem",
              }}
            >
              {user.email}
            </div>
          </div>
          <Link
            className="btn"
            to={ROUTES.SETTINGS}
            onClick={() => setShowUserMenu(false)}
            style={{ ...menuButtonStyles, marginBottom: "0.25rem", textDecoration: "none" }}
          >
            <DynamicIcon name="Settings" size={14} />
            Settings
          </Link>
          <Link
            className="btn"
            to={ROUTES.BILLING}
            onClick={() => setShowUserMenu(false)}
            style={{ ...menuButtonStyles, marginBottom: "0.25rem", textDecoration: "none" }}
          >
            <DynamicIcon name="CreditCard" size={14} />
            Billing
          </Link>
          <button
            type="button"
            className="btn"
            onClick={handleLogout}
            style={{
              ...menuButtonStyles,
              color: "var(--color-danger)",
            }}
          >
            <DynamicIcon name="LogOut" size={14} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
