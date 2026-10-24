import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/vitest-setup.ts"],
    // Agent worktrees live under .claude/ and carry their own copies of the tests.
    exclude: [...configDefaults.exclude, ".claude/**", "e2e/**"],
    server: {
      deps: {
        inline: ["foldkit"],
      },
    },
  },
});
