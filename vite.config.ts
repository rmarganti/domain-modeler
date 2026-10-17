import { defineConfig } from "vite";

import { foldkit } from "@foldkit/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

// Tauri loads the dev server from a fixed URL (see src-tauri/tauri.conf.json).
export default defineConfig({
  plugins: [tailwindcss(), foldkit()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: ["es2022", "safari16", "chrome105"],
  },
});
