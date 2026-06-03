# BGRemove — PowerPoint background remover

A PowerPoint task-pane add-in that removes image backgrounds using
[BiRefNet](https://github.com/ZhengPeng7/BiRefNet) (MIT-licensed) and drops the
cutout straight onto the slide.

- **Add-in shell:** Office.js task pane (Windows, Mac, web).
- **Inference:** **BiRefNet** on a free [Hugging Face Space](https://huggingface.co/spaces/not-lain/background-removal)
  (Gradio API), called through a thin Node proxy. No API key, Python, or GPU needed.
- **Output:** a transparent PNG inserted onto the slide.

## Why a backend?

We first tried running BiRefNet **in the browser** (Transformers.js + ONNX). A
de-risking spike inside real PowerPoint proved it isn't viable for this model:
WebGPU failed (the shader needs 17 storage buffers; GPUs commonly cap at 16) and
the WASM fallback ran out of memory (`std::bad_alloc`) on the 1024×1024
activations. BiRefNet is too heavy for the browser sandbox — so the add-in calls
a backend that runs it.

## How it works

```
Image (file / drop / selected shape)
   → POST /api/remove-bg            src/api/removeBackground.ts
       → Vite proxy (dev)  →  Node proxy (:8787)   server/proxy.mjs
           → HF Space (BiRefNet, Gradio /png)  →  transparent PNG
   → insert onto slide              src/office/insertImage.ts
```

| Path | Role |
| --- | --- |
| `manifest.xml` | Add-in manifest: ribbon button + task pane (`https://localhost:3000`). |
| `taskpane.html`, `src/taskpane/` | UI and controller. |
| `src/api/removeBackground.ts` | Calls the backend, returns the cutout PNG. |
| `src/office/insertImage.ts` | Reads the selected shape and inserts the result. |
| `server/proxy.mjs` | Node proxy → free HF Space (BiRefNet). See `server/README.md`. |

## Prerequisites

- Node.js 18+ (tested on Node 24)
- PowerPoint (desktop or web)
- No API key needed — the default Space is called anonymously.

## Setup (one time)

```powershell
npm install
npm run icons        # generate placeholder icons
npm run dev-certs    # trust the localhost HTTPS cert
```

## Run

Three things, in their own terminals:

```powershell
npm run dev        # 1. HTTPS frontend on https://localhost:3000
npm run server     # 2. backend proxy on http://127.0.0.1:8787
npm run sideload   # 3. registers the add-in and opens desktop PowerPoint
```

Then **Home → Remove Background** opens the pane. For PowerPoint **on the web**,
upload `manifest.xml` via Insert → Add-ins → Upload My Add-in (keep terminals 1 & 2
running; hard-refresh with Ctrl+Shift+R to dodge caching). Stop sideloading with
`npm run stop`.

> The frontend (`npm run dev`) and backend (`npm run server`) must both be running
> whenever you use the add-in. The first removal after the Space has been idle can
> be slow (it wakes from sleep).

## Roadmap / notes

- **Reliability/privacy:** the default is a free *public* Space (it can sleep/queue,
  and images are sent to it). For a real deployment, duplicate the Space into your
  own HF account and set `HF_SPACE`, or self-host BiRefNet (FastAPI + PyTorch)
  behind the same `POST /remove-bg → PNG` contract — the add-in needs no changes.
- **Production:** host the proxy behind HTTPS, point the frontend at its origin
  instead of the dev Vite proxy, and lock CORS to the add-in's origin.
- Replace placeholder icons in `public/`; clean up stale `AppDomains` in the manifest.
- Add tests (compositing/round-trip), lint/format, and CI.

## License

BiRefNet is MIT-licensed. Include its license/attribution when distributing.
