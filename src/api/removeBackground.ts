/**
 * Calls the background-removal backend. In dev, requests go to `/api/...` and
 * Vite proxies them to the local backend (see vite.config.ts), which avoids
 * CORS and HTTPS mixed-content issues. In production, point this at the hosted
 * service origin.
 */
const ENDPOINT = "/api/remove-bg";

export async function removeBackgroundViaApi(
  image: Blob,
  signal?: AbortSignal,
): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      body: image,
      headers: { "Content-Type": image.type || "application/octet-stream" },
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error(
      "Couldn't reach the background-removal service — is the backend running on port 8787?",
      { cause: err },
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Service error ${res.status}: ${detail || res.statusText}`);
  }

  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("Service returned an unexpected response (not an image).");
  }
  return blob;
}
