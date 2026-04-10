/**
 * Header — top navigation with user menu and tour trigger.
 */

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/components/providers/onboarding/OnboardingProvider";
import { DynamicIcon } from "@/lib/icon-resolver";
import { useState, useEffect, useRef, useCallback } from "react";

interface HeaderProps {
  title?: string;
  showTourTrigger?: boolean;
}

const HEADER_GIF_PATH = "/branding/header-title.gif";

function TourMenu() {
  const { startTour, resetTours, isCompleted } = useOnboarding();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const tours = [
    { id: "welcome" as const, label: "Welcome Tour", icon: <DynamicIcon name="HelpCircle" size={14} /> },
    { id: "dashboard" as const, label: "Dashboard Tour", icon: <DynamicIcon name="PlayCircle" size={14} /> },
    { id: "apps" as const, label: "Apps Tour", icon: <DynamicIcon name="PlayCircle" size={14} /> },
    { id: "chat" as const, label: "Chat Tour", icon: <DynamicIcon name="PlayCircle" size={14} /> },
    { id: "store" as const, label: "Store Tour", icon: <DynamicIcon name="PlayCircle" size={14} /> },
  ];

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button className="btn btn-ghost btn-icon" onClick={() => setIsOpen(!isOpen)} title="Start Tour">
        <DynamicIcon name="HelpCircle" size={16} />
      </button>

      {isOpen && (
        <div
          style={{
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
          }}
        >
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
              onClick={() => { startTour(tour.id); setIsOpen(false); }}
              style={{
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
              }}
            >
              {tour.icon}
              <span style={{ flex: 1 }}>{tour.label}</span>
              {isCompleted(tour.id) && (
                <span style={{ fontSize: "0.625rem", color: "var(--color-success)" }}>✓</span>
              )}
            </button>
          ))}
          <div style={{ borderTop: "1px solid var(--color-border)", margin: "0.5rem 0" }} />
          <button
            className="btn"
            onClick={() => { resetTours(); setIsOpen(false); }}
            style={{
              width: "100%",
              justifyContent: "flex-start",
              background: "transparent",
              color: "var(--color-foreground-muted)",
              padding: "0.5rem 0.75rem",
              fontSize: "0.8125rem",
              borderRadius: "8px",
            }}
          >
            Reset All Tours
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ title, showTourTrigger = true }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/login");
  }, [logout, navigate]);

  const userInitials = user?.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "";

  return (
    <header className="app-header">
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        <img
          src={HEADER_GIF_PATH}
          alt={title ?? "Dashboard"}
          loading="eager"
          style={{
            height: "42px",
            width: "auto",
            maxWidth: "min(100%, 220px)",
            objectFit: "contain",
            borderRadius: "10px",
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {/* Command Palette trigger */}
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
          title="Command Palette (Cmd+K)"
        >
          <DynamicIcon name="Command" size={16} />
        </button>

        {showTourTrigger && <TourMenu />}

        {user && (
          <div ref={userMenuRef} style={{ position: "relative" }}>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setShowUserMenu(!showUserMenu)}
              title={user.name}
            >
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
            </button>

            {showUserMenu && (
              <div
                style={{
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
                }}
              >
                <div style={{ padding: "0.75rem", borderBottom: "1px solid var(--color-border)", marginBottom: "0.5rem" }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-foreground)" }}>{user.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)", marginTop: "0.25rem" }}>{user.email}</div>
                </div>
                <button
                  className="btn"
                  onClick={() => { navigate("/settings"); setShowUserMenu(false); }}
                  style={{
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
                    marginBottom: "0.25rem",
                  }}
                >
                  <DynamicIcon name="Settings" size={14} />
                  Settings
                </button>
                <button
                  className="btn"
                  onClick={handleLogout}
                  style={{
                    width: "100%",
                    justifyContent: "flex-start",
                    background: "transparent",
                    color: "var(--color-danger)",
                    padding: "0.5rem 0.75rem",
                    fontSize: "0.8125rem",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <DynamicIcon name="LogOut" size={14} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
