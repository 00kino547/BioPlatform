import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Route pages are lazy-loaded in App.tsx. Keep the two remaining large
        // static payload groups out of the entry chunk: locale JSON is needed
        // by the i18n bootstrap, while lucide-react is shared by many screens.
        // Stable names make bundle reports and cache behavior easier to read.
        manualChunks(id) {
          if (id.includes("/src/locales/")) return "locales";
          if (id.includes("/node_modules/lucide-react/")) return "vendor-icons";
          return undefined;
        },
      },
    },
  },
});
