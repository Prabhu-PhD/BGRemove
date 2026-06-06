// Clean Cut backend. In production this single service does two jobs:
//   1. serves the built task pane (dist/) as static files, and
//   2. handles POST /api/remove-bg by running the image through a hosted
//      BiRefNet (Hugging Face Space, Gradio API) and returning a transparent PNG.
// In local dev, Vite serves the task pane and proxies /api here.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@gradio/client";
import { pickImageUrl } from "./lib.mjs";

const PORT = Number(process.env.PORT) || 8787;
const SPACE = process.env.HF_SPACE || "ZhengPeng7/BiRefNet_demo";
const ENDPOINT = process.env.HF_ENDPOINT || "/image";
const WEIGHTS = process.env.HF_WEIGHTS ?? "Matting-HR"; // "" → single-image endpoints (e.g. /png)
const RESOLUTION = process.env.HF_RESOLUTION ?? ""; // "" → model's native default (2048 for Matting-HR)
const HF_TOKEN = process.env.HF_TOKEN; // required for ZeroGPU spaces
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB upload cap

const STATIC_ROOT = fileURLToPath(new URL("../dist", import.meta.url));
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

// Reuse one Space connection across requests; rebuild it if it goes bad.
let clientPromise = null;
function getClient() {
  if (!clientPromise) {
    clientPromise = Client.connect(SPACE, HF_TOKEN ? { token: HF_TOKEN } : {}).catch(
      (err) => {
        clientPromise = null;
        throw err;
      },
    );
  }
  return clientPromise;
}

/** Best-effort readable message from whatever the Gradio client throws. */
function errText(err) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    return err.message || err.error || err.reason || JSON.stringify(err);
  }
  return String(err);
}

/** Run the prediction, reconnecting and retrying to ride out cold starts. */
async function runRemoval(blob, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const client = await getClient();
      const inputs = WEIGHTS ? [blob, RESOLUTION, WEIGHTS] : [blob];
      return await client.predict(ENDPOINT, inputs);
    } catch (err) {
      lastErr = err;
      clientPromise = null; // force a fresh connection on the next attempt
      console.warn(`[clean-cut] attempt ${i + 1}/${attempts} failed: ${errText(err)}`);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastErr;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...headers,
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BYTES) throw new Error("Image too large (max 25 MB).");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Serve a file from the built dist/ folder (the task pane). */
async function serveStatic(req, res) {
  let pathname = decodeURIComponent((req.url || "/").split("?")[0]);
  if (pathname === "/") pathname = "/taskpane.html";
  const filePath = join(STATIC_ROOT, normalize(pathname));
  if (!filePath.startsWith(STATIC_ROOT)) return send(res, 403, "Forbidden");
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type":
        CONTENT_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    send(res, 404, "Not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, "");
    if (req.method === "GET" && req.url === "/health") return send(res, 200, "ok");
    if (req.method === "GET") return serveStatic(req, res);
    if (req.method !== "POST" || !req.url?.endsWith("/remove-bg")) {
      return send(res, 404, "Not found");
    }

    const input = await readBody(req);
    if (!input.length) return send(res, 400, "Empty request body.");

    const contentType = req.headers["content-type"] || "image/png";
    const result = await runRemoval(new Blob([input], { type: contentType }));

    const outUrl = pickImageUrl(result?.data);
    if (!outUrl) return send(res, 502, "Space returned no image.");

    const out = await fetch(outUrl);
    if (!out.ok) return send(res, 502, `Failed to fetch result image (${out.status}).`);
    const outBuf = Buffer.from(await out.arrayBuffer());

    send(res, 200, outBuf, {
      "Content-Type": out.headers.get("content-type") || "image/png",
      "Content-Length": String(outBuf.length),
    });
  } catch (err) {
    console.error("[clean-cut]", err);
    if (!res.headersSent) {
      send(
        res,
        502,
        `Background removal failed: ${errText(err)}. The free Space may be waking from sleep — try again in a moment.`,
      );
    }
  }
});

// Bind all interfaces (0.0.0.0) so cloud hosts like Render can reach it.
server.listen(PORT, () => {
  console.log(
    `Clean Cut → ${SPACE} ${ENDPOINT}${WEIGHTS ? ` [${WEIGHTS}]` : ""}  on :${PORT}`,
  );
  console.log(
    HF_TOKEN ? "Using HF token." : "No HF_TOKEN set — ZeroGPU calls will fail.",
  );
});
