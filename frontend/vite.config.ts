import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const HARDCODED_API_BASE_URL = "https://linhdzqua148-superin-be.hf.space";

function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) {
    return undefined;
  }

  if (
    id.includes("@assistant-ui/react") ||
    id.includes("@assistant-ui/react-data-stream") ||
    id.includes("assistant-stream") ||
    id.includes("react-markdown") ||
    id.includes("remark-gfm")
  ) {
    return "chat";
  }

  if (id.includes("lucide-react/dynamicIconImports")) {
    return "dynamic-icons";
  }

  if (id.includes("react-grid-layout") || id.includes("react-resizable")) {
    return "dashboard-grid";
  }

  if (id.includes("driver.js")) {
    return "onboarding";
  }

  if (id.includes("axios") || id.includes("jwt-decode")) {
    return "client";
  }

  return undefined;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: HARDCODED_API_BASE_URL,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks,
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
