// Pure helpers for the proxy (no side effects → unit-testable).

/**
 * From a Gradio result's `data`, extract the output image URL.
 * Handles an array of outputs, a single FileData object, or a plain string URL.
 * Returns null when there's nothing usable.
 */
export function pickImageUrl(data) {
  const file = Array.isArray(data) ? data[0] : data;
  if (!file) return null;
  if (typeof file === "string") return file;
  return file.url ?? null;
}
