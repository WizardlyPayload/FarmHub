import { defineConfig, loadEnv } from "vite";
import preact from "@preact/preset-vite";
import path from "node:path";

function farmdashProxyTarget(mode: string): string {
  const env = loadEnv(mode, process.cwd(), "");
  const raw = (env.VITE_FARMDASH_API || process.env.VITE_FARMDASH_API || "127.0.0.1:8766").trim();
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `http://${raw}`;
}

export default defineConfig(({ mode }) => {
  const apiTarget = farmdashProxyTarget(mode);
  const proxy = { target: apiTarget, changeOrigin: true };

  return {
    plugins: [preact()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        // Serve NEW APP public/locales locally (do not proxy — keeps fresh i18n catalog).
        "/api": proxy,
        "/assests": proxy,
        // PDA overview PNGs from Electron (`/map-overview-cache/<key>.png`).
        "/map-overview-cache": proxy,
        "/fill-type-hud": proxy,
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
          setup: path.resolve(__dirname, "setup.html"),
          simhub: path.resolve(__dirname, "simhub.html"),
        },
      },
    },
  };
});
