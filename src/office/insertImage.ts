/** Office.js helpers for moving images in and out of the active presentation. */

/** Convert a Blob to a base64 string WITHOUT the `data:...;base64,` prefix. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

/** Natural pixel dimensions of an image Blob. */
async function imagePixelSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/** Re-encode the image with its longest side capped to `maxPx` (never upscales). */
async function capLongestSide(blob: Blob, maxPx: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= maxPx) {
    bitmap.close();
    return blob;
  }
  const scale = maxPx / longest;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return blob;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))),
      "image/png",
    );
  });
}

function setSelectedImage(
  base64: string,
  options: Office.SetSelectedDataOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    Office.context.document.setSelectedDataAsync(base64, options, (res) => {
      if (res.status === Office.AsyncResultStatus.Succeeded) resolve();
      else reject(new Error(res.error?.message ?? "Could not insert the image."));
    });
  });
}

/**
 * Insert a PNG (Blob) onto the current slide, sized to its native dimensions
 * (capped to fit a slide). `setSelectedDataAsync` has a maximum data size —
 * larger on desktop, stricter on the web — so if PowerPoint reports the data is
 * too large, we progressively downscale and retry, inserting the highest-
 * resolution version that fits.
 */
export async function insertImageOntoSlide(png: Blob): Promise<void> {
  const MAX_SIDE_PT = 600; // ~8.3in display size
  const FLOOR_PX = 700; // don't shrink the cutout below this
  let blob = await capLongestSide(png, 2048);

  for (let attempt = 0; attempt < 6; attempt++) {
    const { width, height } = await imagePixelSize(blob);
    const ptW = width * 0.75; // px @96dpi -> points
    const ptH = height * 0.75;
    const scale = Math.min(1, MAX_SIDE_PT / Math.max(ptW, ptH));
    const options: Office.SetSelectedDataOptions = {
      coercionType: Office.CoercionType.Image,
      imageWidth: Math.round(ptW * scale),
      imageHeight: Math.round(ptH * scale),
    };

    const base64 = await blobToBase64(blob);
    try {
      await setSelectedImage(base64, options);
      return;
    } catch (err) {
      const longest = Math.max(width, height);
      const tooLarge = err instanceof Error && /too large/i.test(err.message);
      if (tooLarge && longest > FLOOR_PX) {
        blob = await capLongestSide(blob, Math.round(longest * 0.75));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Returns the currently selected shape rendered as a base64 PNG, or null if
 * nothing usable is selected. Uses the PowerPoint-specific Shape API, which is
 * newer — callers should handle this throwing on older hosts.
 */
export async function getSelectedImageBase64(): Promise<string | null> {
  return PowerPoint.run(async (context) => {
    const shapes = context.presentation.getSelectedShapes();
    shapes.load("items");
    await context.sync();

    if (shapes.items.length === 0) return null;

    const first = shapes.items[0] as unknown as {
      getImageAsBase64: () => OfficeExtension.ClientResult<string>;
    };
    if (typeof first.getImageAsBase64 !== "function") return null;

    const result = first.getImageAsBase64();
    await context.sync();
    return result.value || null;
  });
}
