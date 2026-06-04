# Clean Cut backend (proxy)

A thin Node proxy that runs background removal through **BiRefNet** hosted on a
free **Hugging Face Space** (Gradio API) and returns a transparent PNG. No Python
or GPU needed locally — just a free HF token (the model runs on HF's ZeroGPU).

By default it calls [`ZhengPeng7/BiRefNet_demo`](https://huggingface.co/spaces/ZhengPeng7/BiRefNet_demo)
with the **Matting-HR** weights (best on hair / soft edges, 2048px-trained).

```
add-in → POST /api/remove-bg (raw image bytes)
   → Vite proxy (dev) → this server (:8787)
       → HF Space (Gradio /image, Matting-HR) → [original, cutout]
   ← transparent PNG (the cutout)
```

## Setup & run

1. Get a free HF token (no card): https://huggingface.co/settings/tokens ("Read" is enough).
2. `Copy-Item server/.env.example server/.env` and set `HF_TOKEN=...`
3. From the project root: `npm run server` (listens on `http://127.0.0.1:8787`).

The dev frontend reaches it via the Vite proxy at `/api/*`, so the task pane stays
same-origin + HTTPS.

## Endpoints

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `POST` | `/remove-bg` | raw image bytes (`Content-Type: image/*`) | `image/png` (transparent) |
| `GET` | `/health` | — | `ok` |

## Config (env)

| Var | Default | Notes |
| --- | --- | --- |
| `HF_TOKEN` | — | **Required.** Your free HF token (ZeroGPU quota). |
| `HF_SPACE` | `ZhengPeng7/BiRefNet_demo` | Any BiRefNet Gradio Space. |
| `HF_ENDPOINT` | `/image` | The Space's image endpoint. |
| `HF_WEIGHTS` | `Matting-HR` | BiRefNet variant (General-HR, Matting, Portrait…). `""` for a single-image endpoint like `/png`. |
| `HF_RESOLUTION` | `` (auto) | e.g. `2048x2048`; empty = the model's native default. |
| `PORT` | `8787` | Must match the Vite proxy target in `vite.config.ts`. |

## Notes

- The proxy progressively retries on cold starts and surfaces the real Space error.
- Output URL handling (`pickImageUrl`) takes the **last** image in the result, which
  is the transparent cutout for a before/after ImageSlider endpoint.
- **Quota:** Matting-HR at 2048px uses more ZeroGPU time per image. Fine for personal /
  small-team use; if you exhaust the free quota, HF Pro (~$9/mo) or your own duplicated
  Space gives more.
- The `POST /remove-bg → PNG` contract is the seam to swap models/Spaces (or a
  self-hosted backend) without touching the add-in.
