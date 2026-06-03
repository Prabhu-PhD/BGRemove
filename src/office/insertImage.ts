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

/** Insert a PNG (given as a Blob) onto the current slide at the selection. */
export async function insertImageOntoSlide(png: Blob): Promise<void> {
  const base64 = await blobToBase64(png);
  return new Promise((resolve, reject) => {
    Office.context.document.setSelectedDataAsync(
      base64,
      { coercionType: Office.CoercionType.Image },
      (res) => {
        if (res.status === Office.AsyncResultStatus.Succeeded) resolve();
        else reject(new Error(res.error?.message ?? "Could not insert the image."));
      },
    );
  });
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
