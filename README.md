# BGRemove — PowerPoint background remover

A PowerPoint task-pane add-in that removes image backgrounds using
[BiRefNet](https://github.com/ZhengPeng7/BiRefNet) (MIT-licensed) and drops the
cutout straight onto the slide.

- **Add-in shell:** Office.js task pane (Windows, Mac, web).
- **Inference:** **BiRefNet** on a free [Hugging Face Space](https://huggingface.co/spaces/not-lain/background-removal)
  (Gradio API), called through a thin Node proxy. No API key, Python, or GPU needed.
- **Output:** a transparent PNG inserted onto the slide.

> Full architecture, end-to-end data flow, and cost breakdown:
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

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

Start the frontend **and** backend together (keep this terminal open):

```powershell
npm run dev:all     # https://localhost:3000 (web) + http://127.0.0.1:8787 (api)
```

Then, in a second terminal, sideload into PowerPoint:

```powershell
npm run sideload    # registers the add-in and opens desktop PowerPoint
```

Then **Home → Remove Background** opens the pane. For PowerPoint **on the web**,
upload `manifest.xml` via Insert → Add-ins → Upload My Add-in (keep `dev:all`
running; hard-refresh with Ctrl+Shift+R to dodge caching). Stop sideloading with
`npm run stop`.

> **The add-in only loads while `npm run dev:all` is running** — it's a local web app,
> so closing that terminal (or restarting your PC) stops it, and the pane won't load
> until you start it again. (`dev:all` just runs `npm run dev` + `npm run server`
> together; you can still run them in separate terminals if you prefer.) The first
> removal after the Space has been idle can be slow as it wakes from sleep.

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
