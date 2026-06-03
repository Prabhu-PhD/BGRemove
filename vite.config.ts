import { defineConfig } from "vite";
import * as devCerts from "office-addin-dev-certs";

// Office Add-ins must be served over HTTPS. We reuse the trusted localhost
// certificate created by `npm run dev-certs` (office-addin-dev-certs).
// If the cert isn't installed yet, we fall back to HTTP so the build still runs.
export default defineConfig(async () => {
  let https: { key: Buffer; cert: Buffer; ca: Buffer } | undefined;
  try {
    const opts = await devCerts.getHttpsServerOptions();
    https = { key: opts.key, cert: opts.cert, ca: opts.ca };
  } catch {
    console.warn(
      '[vite] Office dev certs not found — run "npm run dev-certs". Serving over HTTP for now.',
    );
  }

  return {
    server: {
      port: 3000,
      strictPort: true,
      https,
      // Proxy API calls to the local BiRefNet backend (on :8787, any language).
      // Keeps the task pane same-origin + HTTPS, avoiding CORS / mixed content.
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8787",
          changeOrigin: true,
          // CPU inference can be slow — don't time the request out early.
          timeout: 600000,
          proxyTimeout: 600000,
        },
      },
    },
    build: {
      target: "es2022",
      rollupOptions: {
        input: {
          taskpane: "taskpane.html",
          commands: "commands.html",
        },
      },
    },
  };
});
