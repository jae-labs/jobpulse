import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/react-router/") ||
              id.includes("/react-router-dom/")
            ) {
              return "vendor";
            }
            if (id.includes("@supabase")) {
              return "supabase";
            }
            if (id.includes("@tanstack")) {
              return "query";
            }
            if (id.includes("@dnd-kit")) {
              return "dnd";
            }
          }
        },
      },
    },
  },
  plugins: [
    // Strip localhost/127.0.0.1 from CSP connect-src in production builds
    {
      name: 'strip-localhost-csp',
      transformIndexHtml(html, ctx) {
        if (ctx.server) return html; // keep localhost in dev
        return html.replace(
          / http:\/\/127\.0\.0\.1:\* ws:\/\/127\.0\.0\.1:\* http:\/\/localhost:\* ws:\/\/localhost:\*/g,
          ''
        );
      },
    },
    react(),
    tailwindcss(),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 20,
        branches: 20,
        functions: 20,
        lines: 20,
      },
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/types/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
      ],
    },
  },
});
