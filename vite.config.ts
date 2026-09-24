import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { fileURLToPath, URL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { visualizer } from "rollup-plugin-visualizer";

function addSupabaseCspOrigins(content: string, apiUrl: string): string {
  if (!apiUrl) return content;
  const url = new URL(apiUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('VITE_SUPABASE_URL must use HTTP or HTTPS');
  }
  const websocketUrl = new URL(url.origin);
  websocketUrl.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return content
    .replace("img-src 'self' data: blob:;", `img-src 'self' data: blob: ${url.origin};`)
    .replace("connect-src 'self';", `connect-src 'self' ${url.origin} ${websocketUrl.origin};`);
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL || '';
  return {
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
    chunkSizeWarningLimit: 600,
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
    // Scope network and image access to the one configured Supabase project.
    {
      name: 'supabase-csp-origins',
      transformIndexHtml(html) {
        return addSupabaseCspOrigins(html, supabaseUrl);
      },
      async closeBundle() {
        const headersPath = fileURLToPath(new URL('./dist/_headers', import.meta.url));
        const headers = await readFile(headersPath, 'utf8');
        await writeFile(headersPath, addSupabaseCspOrigins(headers, supabaseUrl));
      },
    },
    react(),
    tailwindcss(),
    ...(process.env.ANALYZE === 'true'
      ? [
          visualizer({
            filename: 'dist/stats.html',
            open: false,
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
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
  };
});
