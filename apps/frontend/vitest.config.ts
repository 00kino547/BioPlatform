// Vitest config for the frontend regression suite.
//
// Deliberately separate from vite.config.ts: the production build must not pull
// in the test environment, and the tests only need the React JSX transform + the
// `@/` alias (not Tailwind or the dev server). `envDir` matches the real config
// so `import.meta.env.VITE_*` reads resolve the same way.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Deterministic: each test gets fresh module mocks and cleared DOM.
    restoreMocks: true,
    clearMocks: true,
  },
});
