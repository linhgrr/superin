/**
 * Header — Refined top navigation.
 *
 * Shows page title, user menu với refined interactions.
 */

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, Settings, Sun, Moon, ChevronDown } from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface HeaderProps {
  title?: string;
}

type Theme = "light" | "dark" | "system";

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("theme") as Theme) || "system";
  });
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    if (theme === "dark" || (theme === "system" && systemDark)) {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
    }

    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getIcon = () => {
    if (theme === "light") return <Sun size={16} />;
    if (theme === "dark") return <Moon size={16} />;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? <Moon size={16} /> : <Sun size={16} />;
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        className="btn btn-ghost btn-icon"
        onClick={() => setIsOpen(!isOpen)}
        title="Theme"
      >
        {getIcon()}
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
            minWidth: "140px",
            boxShadow: "0 8px 32px oklch(0 0 0 / 0.3)",
            zIndex: 100,
            animation: "fadeInScale 0.15s ease",
          }}
        >
          {(["light", "dark", "system"] as Theme[]).map((t) => (
            <button
              key={t}
              className="btn"
              onClick={() => {
                setTheme(t);
                setIsOpen(false);
              }}
              style={{
                width: "100%",
                justifyContent: "flex-start",
                background: theme === t ? "var(--color-primary-muted)" : "transparent",
                color: theme === t ? "var(--color-primary)" : "var(--color-foreground)",
                padding: "0.5rem 0.75rem",
                fontSize: "0.8125rem",
                borderRadius: "8px",
                fontWeight: theme === t ? 600 : 500,
              }}
            >
              {t === "light" && <Sun size={14} style={{ marginRight: "0.5rem" }} />}
              {t === "dark" && <Moon size={14} style={{ marginRight: "0.5rem" }} />}
              {t === "system" && <Settings size={14} style={{ marginRight: "0.5rem" }} />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header({ title }: HeaderProps) {
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

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <header className="app-header">
      {/* Title */}
      <h1 className="app-header-title">
        {title ?? "Dashboard"}
      </h1>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {/* Theme toggle */}
        <ThemeToggle />

        {/* User menu */}
        {user && (
          <div ref={userMenuRef} style={{ position: "relative" }}>
            <button
              className="btn btn-ghost"
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
                padding: "0.5rem 0.75rem",
              }}
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
                {user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ textAlign: "left" }}>
                <div
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color: "var(--color-foreground)",
                    lineHeight: 1.2,
                  }}
                >
                  {user.name}
                </div>
                <div
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--color-foreground-muted)",
                    lineHeight: 1.2,
                  }}
                >
                  {user.email}
                </div>
              </div>
              <ChevronDown size={14} style={{ color: "var(--color-foreground-muted)" }} />
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
                  zIndex: 100,
                  animation: "fadeInScale 0.15s ease",
                }}
              >
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
                  }}
                >
                  <LogOut size={14} style={{ marginRight: "0.5rem" }} />
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
