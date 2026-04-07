/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

function getRequiredEnv(env: Record<string, string>, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required frontend env: ${name}`);
  }
  return value;
}

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const apiBaseUrl = getRequiredEnv(env, "VITE_API_URL");

  return {
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
          target: apiBaseUrl,
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
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test-setup.ts"],
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
  };
});
