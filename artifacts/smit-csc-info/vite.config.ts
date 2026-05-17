import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // pdfjs-dist ships its own ESM worker (`pdf.worker.min.mjs`) that we load
    // via `?url`. Letting Vite pre-bundle pdfjs-dist causes the dynamic
    // import URL to flip on every dep-graph rescan ("?v=..." query), which
    // intermittently 504s the lazy chunk and produces:
    //   "Failed to fetch dynamically imported module: .../deps/pdfjs-dist.js?v=..."
    // Excluding it forces Vite to serve the original ESM directly so the
    // version hash stays stable across reloads.
    exclude: ["pdfjs-dist"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
      // Allow Vite to serve files from the pnpm workspace root so that
      // `?url` imports from hoisted packages (e.g. pdfjs-dist worker
      // stored under /<workspace>/node_modules/.pnpm/...) resolve via
      // the /@fs/ prefix instead of being denied by strict mode.
      allow: [path.resolve(import.meta.dirname, "..", "..")],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
