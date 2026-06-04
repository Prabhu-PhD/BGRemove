// Pure helpers for the proxy (no side effects → unit-testable).

/**
 * From a Gradio result's `data`, extract the output image URL. Handles a single
 * FileData, an array of outputs, or a nested ImageSlider value ([original,
 * cutout]). Returns the LAST image URL found — which is the processed cutout for
 * a before/after slider, and the only URL for single-image endpoints.
 */
export function pickImageUrl(data) {
  const urls = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === "string") {
      urls.push(v);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (typeof v === "object") {
      if (typeof v.url === "string") urls.push(v.url);
      else if (typeof v.path === "string") urls.push(v.path);
    }
  };
  walk(data);
  return urls.length ? urls[urls.length - 1] : null;
}
