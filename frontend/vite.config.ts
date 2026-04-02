import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

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
        target: process.env.VITE_API_URL || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        // Code splitting strategy cho plug-n-play apps
        manualChunks: {
          // Core vendor libs - preload
          vendor: ["react", "react-dom", "react-router-dom"],
          // UI libs
          ui: ["@assistant-ui/react", "@assistant-ui/react-data-stream", "lucide-react"],
        },
        // Đảm bảo mỗi dynamic import tạo chunk riêng
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
