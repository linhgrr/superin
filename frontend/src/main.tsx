import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./app/globals.css";

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