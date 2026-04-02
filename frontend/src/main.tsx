import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./app/globals.css";
import { discoverAndRegisterApps } from "./apps";

// Init lazy app discovery - chạy ngay khi boot
// Không block render, chỉ scan để biết app nào khả dụng
discoverAndRegisterApps().then((apps) => {
  if (import.meta.env.DEV) {
    console.log("[Main] Lazy apps discovered:", apps.map((a) => a.id));
  }
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
