/**
 * Header — top bar for the dashboard / app pages.
 *
 * Shows page title, search, and user menu.
 */

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface HeaderProps {
  title?: string;
}

export default function Header({ title }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <header
      style={{
        height: "56px",
        borderBottom: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        padding: "0 1.5rem",
        gap: "1rem",
        background: "var(--color-surface)",
        flexShrink: 0,
      }}
    >
      {/* Title */}
      <h1
        style={{
          margin: 0,
          fontSize: "1rem",
          fontWeight: 600,
          fontFamily: "var(--font-heading)",
          color: "var(--color-foreground)",
          flex: 1,
        }}
      >
        {title ?? "Dashboard"}
      </h1>

      {/* User menu */}
      {user && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "var(--color-foreground)",
                lineHeight: 1.2,
              }}
            >
              {user.name}
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--color-muted)",
                lineHeight: 1.2,
              }}
            >
              {user.email}
            </div>
          </div>

          <button
            className="btn btn-ghost"
            onClick={handleLogout}
            title="Sign out"
            style={{ padding: "0.375rem 0.625rem" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16,17 21,12 16,7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      )}
    </header>
  );
}
