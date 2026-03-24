import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    watch: {
      usePolling: true,
      interval: 1000,
    },
    proxy: {
      "/api": { target: `http://${process.env.API_HOST || "localhost"}:8000`, changeOrigin: true },
      "/ws": { target: `ws://${process.env.API_HOST || "localhost"}:8000`, ws: true },
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
