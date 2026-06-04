# BGRemove — Architecture

A PowerPoint **task-pane add-in** (a local web app embedded in PowerPoint) that
removes an image's background with **BiRefNet** and inserts the transparent cutout
onto the slide. BiRefNet is too heavy to run in the browser, so the add-in sends
the image to a thin local **proxy**, which runs it on a free **Hugging Face Space**
and returns a transparent PNG.

## End-to-end workflow

1. **Open** — Click **Home → Remove Background**. The ribbon button is declared in
   `manifest.xml` (`VersionOverrides`) and opens the task pane at
   `https://localhost:3000/taskpane.html`.
2. **Boot** — `taskpane.html` loads Office.js (Microsoft CDN) + the controller
   `src/taskpane/main.ts`. `Office.onReady` fires, detects PowerPoint, shows "Ready."
3. **Pick an image** — file picker, drag-drop, or **"Use image selected on the
   slide"** → `getSelectedImageBase64()` in `src/office/insertImage.ts`
   (`PowerPoint.run` → `getSelectedShapes` → `getImageAsBase64`). Original shows in
   the left preview.
4. **Remove** — Clicking **Remove background** calls `removeBackgroundViaApi(blob,
   signal)` (`src/api/removeBackground.ts`) with an `AbortController`, POSTing the
   **raw image bytes** to `/api/remove-bg`.
5. **Proxy hop** — Same-origin HTTPS on `:3000`; the Vite dev server **proxies
   `/api` → `http://127.0.0.1:8787`** (`vite.config.ts`). This avoids CORS and
   HTTPS mixed-content issues.
6. **Inference** — `server/proxy.mjs` reads the body (25 MB cap) and, via
   `@gradio/client`, calls the `ZhengPeng7/BiRefNet_demo` Space's **`/image`**
   endpoint with the **Matting-HR** weights. BiRefNet runs on HF's ZeroGPU and
   returns a before/after pair; the proxy keeps the transparent cutout.
7. **Return** — `pickImageUrl()` (`server/lib.mjs`) extracts the output URL from the
   Gradio result; the proxy fetches it and streams the PNG back as `image/png`.
8. **Preview + insert** — `main.ts` shows the cutout (checkerboard = transparency);
   **Insert onto slide** → `insertImageOntoSlide()` →
   `Office.context.document.setSelectedDataAsync(base64, { coercionType: Image })`.

```
[Ribbon: Remove Background]            manifest.xml
          | opens task pane (https://localhost:3000)
          v
 taskpane.html + main.ts --pick / drop / selected shape--> original preview
          |  POST /api/remove-bg  (raw bytes)              src/api/removeBackground.ts
          v
 Vite :3000 --proxy /api--> Node proxy :8787               vite.config.ts -> server/proxy.mjs
                                  |  @gradio/client -> "/image" (Matting-HR)
                                  v
                    HF Space (BiRefNet Matting-HR) --> transparent cutout
          +-----------------------+  (proxy fetches result URL, returns image/png)
          v
 main.ts -> result preview --Insert--> setSelectedDataAsync --> slide   src/office/insertImage.ts
```

## Tech stack

**Frontend (task pane)**

| Tech | Used for |
| --- | --- |
| TypeScript | Typed UI / controller logic |
| Vite 8 | HTTPS dev server (`:3000`) + bundler |
| Office.js (`@types/office-js`) | Host API — `Office.onReady`, `setSelectedDataAsync`, `PowerPoint.run` |
| Vanilla DOM + CSS | The pane UI (intentionally framework-free) |

**Office integration**

| Tech | Used for |
| --- | --- |
| XML manifest | Task pane + ribbon button, `SourceLocation`, `ReadWriteDocument` permission |
| `office-addin-dev-certs` | Generates/trusts the localhost HTTPS cert |
| `office-addin-debugging` | `npm run sideload` — registers the add-in, opens PowerPoint |

**Backend**

| Tech | Used for |
| --- | --- |
| Node.js (`node:http`) | The proxy server (`:8787`), no web framework |
| `@gradio/client` | Calls the HF Space's Gradio `/image` endpoint (Matting-HR) |
| HF Space `ZhengPeng7/BiRefNet_demo` | Runs **BiRefNet Matting-HR** — free; needs a free HF token (ZeroGPU) |
| `node --env-file-if-exists` | `server/.env`: `HF_TOKEN` (required), `HF_SPACE`, `HF_WEIGHTS`, `HF_RESOLUTION`, `PORT` |

**Build & quality**

| Tech | Used for |
| --- | --- |
| `tsc --noEmit` + Vite | Typecheck + production build |
| ESLint 10 + typescript-eslint | Linting |
| Prettier 3 | Formatting |
| Vitest 4 | Unit tests — API client paths + `pickImageUrl` (9 tests) |
| `concurrently` | `npm run dev:all` runs frontend + backend together |
| GitHub Actions | CI on push/PR: format → lint → build → test |

## Key design decisions

- **Backend, not in-browser.** A spike in real PowerPoint proved client-side
  BiRefNet won't run: WebGPU failed (its shader needs 17 storage buffers; common
  GPUs cap at 16) and the WASM fallback hit `std::bad_alloc` (OOM) on the 1024²
  activations. Inference therefore runs server-side.
- **The Vite `/api` proxy.** Lets the task pane call a same-origin HTTPS path,
  sidestepping CORS and the HTTPS→HTTP mixed-content block.
- **Free anonymous HF Space behind a thin proxy.** Zero cost, no key. The proxy
  exposes a stable `POST /remove-bg → PNG` contract, so the engine (Space, a paid
  API, or a self-hosted model) can be swapped **without touching the add-in**.
- **`npm install` (not `npm ci`) in CI.** The lockfile is generated on Windows,
  which omits Linux-only optional deps (`@emnapi/*`, Rollup's native binary), so
  `npm ci`'s strict sync check fails on the Linux runner.

## Cost

**Today: $0.** The HF Space is free (your HF token), GitHub + Actions are free at this
scale, BiRefNet is MIT-licensed, and everything runs locally.

| Stage | Frontend | Proxy/backend | Inference | Monthly (approx.) |
| --- | --- | --- | --- | --- |
| **Now** (local dev) | $0 (your PC) | $0 (your PC) | $0 (free public Space) | **$0** |
| **Personal** (deployed) | $0 (static host) | $0–$5 (free tier / serverless) | $0 (own free CPU Space) or HF Pro $9 (ZeroGPU) | **~$0–$9** |
| **Scale** | $0 (static) | ~$0–$10 | cost driver — see below | usage-based |

The only real cost is **reliable inference at volume**:

- **Pay-per-image** (managed API — fal / Replicate): ~$0.001–$0.002/image
  (~$10–$20 per 10k images). $0 when idle; needs billing set up.
- **Always-on GPU** (own HF GPU Space or cloud VM): ~$0.40–$1/hr (~$300–$700/mo if
  24/7; less if it sleeps/scales-to-zero). HF Pro ($9/mo) + ZeroGPU is the low-volume
  middle ground.

Non-monetary trade-offs: the free public Space can queue/sleep (cold starts) and
isn't appropriate for production traffic; the app only works while the local servers
run. Publishing to **AppSource is free** (needs a privacy policy + HTTPS hosting);
a domain is ~$12/yr.

## Productionizing (what changes)

1. Host the static frontend (GitHub Pages / Netlify / Cloudflare Pages) and update
   the manifest `SourceLocation` to that HTTPS origin.
2. Host the proxy behind HTTPS; point the frontend at its origin (instead of the dev
   Vite proxy) and restrict CORS to the add-in's origin.
3. Replace the public Space with your own duplicated Space or a paid/self-hosted
   engine — same `POST /remove-bg → PNG` contract, no add-in changes.
4. Replace placeholder icons; clean up the manifest `AppDomains`; submit to AppSource.
