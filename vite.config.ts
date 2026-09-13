import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    host: "127.0.0.1",
    port: 43_173,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 43_173,
    proxy: {
      "/api/files": {
        changeOrigin: true,
        target: "http://127.0.0.1:43174",
      },
    },
  },
});
