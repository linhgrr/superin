import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./app/globals.css";

if (import.meta.env.DEV) {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Maximum update depth exceeded")) {
      originalConsoleError("[debug][max-depth] Captured React update-depth error.");
      originalConsoleError("[debug][max-depth] URL:", window.location.href);
      originalConsoleError(new Error("[debug][max-depth] stack trace").stack);
    }
    originalConsoleError(...args);
  };
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

const updateApp = registerSW({
  onNeedRefresh() {
    const shouldRefresh = window.confirm(
      "A new version of Shin is available. Reload to update?"
    );
    if (shouldRefresh) updateApp(true);
  },
  onOfflineReady() {
    console.info("[PWA] App ready to work offline.");
  },
  onRegistered(registration) {
    console.info("[PWA] Service worker registered.", registration);
  },
  onRegisterError(error) {
    console.warn("[PWA] Service worker registration failed.", error);
  },
});

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
