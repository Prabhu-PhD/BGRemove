// Thin proxy: receives raw image bytes from the add-in, runs them through a
// hosted BiRefNet on a free Hugging Face Space (Gradio API), and returns the
// transparent PNG. No API key required (anonymous), no Python or GPU locally.
import { createServer } from "node:http";
import { Client } from "@gradio/client";
import { pickImageUrl } from "./lib.mjs";

const PORT = Number(process.env.PORT) || 8787;
const SPACE = process.env.HF_SPACE || "ZhengPeng7/BiRefNet_demo";
const ENDPOINT = process.env.HF_ENDPOINT || "/image";
const WEIGHTS = process.env.HF_WEIGHTS ?? "Matting-HR"; // "" → single-image endpoints (e.g. /png)
const RESOLUTION = process.env.HF_RESOLUTION ?? ""; // "" → model's native default (2048 for Matting-HR)
const HF_TOKEN = process.env.HF_TOKEN; // required for ZeroGPU spaces (set in server/.env)
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB upload cap

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
      console.warn(
        `[bgremove-proxy] attempt ${i + 1}/${attempts} failed: ${errText(err)}`,
      );
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

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, "");
    if (req.method === "GET" && req.url === "/health") return send(res, 200, "ok");
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
    console.error("[bgremove-proxy]", err);
    if (!res.headersSent) {
      send(
        res,
        502,
        `Background removal failed: ${errText(err)}. The free Space may be waking from sleep — try again in a moment.`,
      );
    }
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Clean Cut proxy → ${SPACE} ${ENDPOINT}${WEIGHTS ? ` [${WEIGHTS}]` : ""}  on http://127.0.0.1:${PORT}`,
  );
  console.log(
    HF_TOKEN
      ? "Using HF token."
      : "Anonymous (no token). Set HF_TOKEN in server/.env if needed.",
  );
});
