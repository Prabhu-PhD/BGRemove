# BGRemove backend (proxy)

A thin Node proxy that runs background removal through **BiRefNet** hosted on a
free **Hugging Face Space** (Gradio API) and returns a transparent PNG. No API
key, Python, or GPU required.

```
add-in → POST /api/remove-bg (raw image bytes)
   → Vite proxy (dev) → this server (:8787)
       → HF Space (Gradio /png endpoint) → transparent PNG file
   ← transparent PNG
```

## Run

From the project root:
```powershell
npm run server
```
It listens on `http://127.0.0.1:8787` and, by default, calls the public Space
`not-lain/background-removal` **anonymously**. The dev frontend reaches it via the
Vite proxy at `/api/*`, so the task pane stays same-origin + HTTPS.

No `.env` is needed for the defaults — copy `server/.env.example` to `server/.env`
only to override them.

## Endpoints

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `POST` | `/remove-bg` | raw image bytes (`Content-Type: image/*`) | `image/png` (transparent) |
| `GET` | `/health` | — | `ok` |

## Config (all optional)

| Var | Default | Notes |
| --- | --- | --- |
| `HF_SPACE` | `not-lain/background-removal` | Any BiRefNet Gradio Space. |
| `HF_ENDPOINT` | `/png` | The Space's image→PNG endpoint. |
| `HF_TOKEN` | — | Only for private / ZeroGPU Spaces (free token, no card). |
| `PORT` | `8787` | Must match the Vite proxy target in `vite.config.ts`. |

## Caveats & production notes

- The free public Space can **sleep or queue** — the first call after it's been
  idle may take a while (cold start). For reliability, **duplicate the Space into
  your own HF account** ("Duplicate this Space" on the Space page) and set
  `HF_SPACE` to it.
- Images are sent to the Space for processing (not fully local). To keep them on
  your own infra, self-host BiRefNet (FastAPI + PyTorch) behind the same
  `POST /remove-bg → PNG` contract — the add-in needs no changes.
- Uploads are capped at 25 MB (`MAX_BYTES` in `proxy.mjs`).
- For a deployed add-in, host this behind HTTPS, point the frontend at its origin,
  and restrict CORS to your add-in's origin.
