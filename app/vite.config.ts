/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Relative base so the same build works at /D2-n00b-Bible/beta/ and later at the site root.
export default defineConfig({
  base: "./",
  // Clarity data stays off until Clarity approves the partnership: build with VITE_CLARITY=on to turn it on.
  define: { __CLARITY__: JSON.stringify(process.env.VITE_CLARITY === "on"), __APP_VERSION__: JSON.stringify("b34 · " + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC") },
  worker: { format: "es" },
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", emptyOutDir: true },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
