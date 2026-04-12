/// <reference types="vitest" />
/// <reference types="vite-plugin-pwa/client" />
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

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
    plugins: [
      tailwindcss(),
      react(),
      VitePWA({
        registerType: "autoUpdate",
        devOptions: {
          enabled: mode !== "production",
        },
        manifest: {
          name: "Superin",
          short_name: "Superin",
          description: "Your personal AI-powered SuperApp",
          theme_color: "#b05c32",
          background_color: "#1a1712",
          display: "standalone",
          orientation: "portrait-primary",
          scope: "/",
          start_url: "/",
          icons: [
            {
              src: "/icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any maskable",
            },
            {
              src: "/icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
          categories: ["productivity", "utilities"],
          shortcuts: [
            {
              name: "Dashboard",
              url: "/",
              description: "Open your dashboard",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "gstatic-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\/api\/apps\/.*\/widgets/,
              handler: "NetworkFirst",
              options: {
                cacheName: "api-widgets-cache",
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 4, // 4 hours — balances freshness vs offline resilience
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
            {
              urlPattern: /\/api\/catalog/,
              handler: "NetworkFirst",
              options: {
                cacheName: "api-catalog-cache",
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60, // 1 hour
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
          ],
        },
      }),
    ],
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
