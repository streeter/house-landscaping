import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { mapEditorPlugin } from "./scripts/map-editor-plugin";

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "map-editor" ? [mapEditorPlugin()] : [])],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "tests/**/*.test.ts"],
  },
}));
