import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // No frontend test files exist yet (specs/020 research.md decision 4)
    // — without this, `vitest run` exits 1 on "No test files found",
    // which would make the root `pnpm test` (and therefore CI) always
    // fail regardless of any actual change.
    passWithNoTests: true,
  },
});
