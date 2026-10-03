import { defineConfig } from "vitest/config";
import { loadEnv, type Plugin } from "vite";
import { fileURLToPath, URL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { visualizer } from "rollup-plugin-visualizer";

function sameOriginOnnxRuntimePlugin(): Plugin {
  return {
    name: "same-origin-onnx-runtime",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split("?")[0] !== "/wasm/ort-wasm-simd-threaded.mjs")
          return next();
        try {
          const body = await readFile(
            fileURLToPath(
              new URL(
                "./public/wasm/ort-wasm-simd-threaded.mjs",
                import.meta.url,
              ),
            ),
          );
          response.setHeader("Content-Type", "text/javascript");
          response.end(body);
        } catch {
          next();
        }
      });
    },
    transform(code, id) {
      if (!id.includes("onnxruntime-web") || !id.includes(".mjs")) return;
      // The worker always sets both runtime paths. Avoid bundling unused CDN/default
      // WASM variants, including asyncify assets above Pages' per-file limit.
      return code.replace(
        /new URL\(["']ort-wasm-simd-threaded(?:\.[\w-]+)?\.wasm["'],\s*import\.meta\.url\)(?:\.href)?/g,
        JSON.stringify("/wasm/ort-wasm-simd-threaded.wasm"),
      );
    },
  };
}

export function addSupabaseCspOrigins(content: string, apiUrl: string): string {
  if (!apiUrl) return content;
  const url = new URL(apiUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("VITE_SUPABASE_URL must use HTTP or HTTPS");
  }
  const websocketUrl = new URL(url.origin);
  websocketUrl.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return content
    .replace(
      /img-src\s+([^;]+);/,
      (_, origins) => `img-src ${origins} ${url.origin};`,
    )
    .replace(
      /connect-src\s+([^;]+);/,
      (_, origins) =>
        `connect-src ${origins} ${url.origin} ${websocketUrl.origin};`,
    );
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL ||
    loadEnv(mode, process.cwd(), "VITE_").VITE_SUPABASE_URL ||
    "";
  return {
    optimizeDeps: { include: ["@huggingface/transformers"] },
    worker: { format: "es", plugins: () => [sameOriginOnnxRuntimePlugin()] },
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
      manifest: true,
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
              if (id.includes("@sentry")) {
                return "sentry";
              }
            }
          },
        },
      },
    },
    plugins: [
      sameOriginOnnxRuntimePlugin(),
      // Scope network and image access to the one configured Supabase project.
      {
        name: "supabase-csp-origins",
        transformIndexHtml: {
          order: "post",
          handler(html) {
            // Vite regenerates the entry tag during build, so the source HTML
            // opt-out must also be applied after its module script is emitted.
            return addSupabaseCspOrigins(html, supabaseUrl).replace(
              /<script\b(?=[^>]*\btype="module")/g,
              '<script data-cfasync="false"',
            );
          },
        },
        async closeBundle() {
          const headersPath = fileURLToPath(
            new URL("./dist/_headers", import.meta.url),
          );
          const headers = await readFile(headersPath, "utf8");
          await writeFile(
            headersPath,
            addSupabaseCspOrigins(headers, supabaseUrl),
          );
        },
      },
      react(),
      tailwindcss(),
      ...(process.env.ANALYZE === "true"
        ? [
            visualizer({
              filename: "dist/stats.html",
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
