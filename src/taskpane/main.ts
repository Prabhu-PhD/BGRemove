import { removeBackgroundViaApi } from "../api/removeBackground";
import { insertImageOntoSlide, getSelectedImageBase64 } from "../office/insertImage";

// --- DOM ------------------------------------------------------------------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const statusEl = $("status");
const dropzone = $("dropzone");
const fileInput = $<HTMLInputElement>("file-input");
const useSelectionBtn = $<HTMLButtonElement>("use-selection");
const previews = $("previews");
const originalImg = $<HTMLImageElement>("preview-original");
const resultImg = $<HTMLImageElement>("preview-result");
const removeBtn = $<HTMLButtonElement>("remove-btn");
const insertBtn = $<HTMLButtonElement>("insert-btn");

// --- State ----------------------------------------------------------------
let sourceBlob: Blob | null = null;
let resultBlob: Blob | null = null;
let inPowerPoint = false;
let inFlight: AbortController | null = null;
const objectUrls: string[] = [];

// --- Status helpers -------------------------------------------------------
type StatusKind = "info" | "ok" | "warn" | "err";
function setStatus(message: string, kind: StatusKind = "info", busy = false) {
  statusEl.textContent = message;
  statusEl.className = `status status--${kind}${busy ? " status--busy" : ""}`;
}

function showImage(el: HTMLImageElement, blob: Blob) {
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  el.src = url;
  previews.hidden = false;
}

function setSource(blob: Blob) {
  sourceBlob = blob;
  resultBlob = null;
  showImage(originalImg, blob);
  resultImg.removeAttribute("src");
  removeBtn.disabled = false;
  insertBtn.disabled = true;
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// --- Office bootstrap -----------------------------------------------------
Office.onReady(({ host }) => {
  inPowerPoint = host === Office.HostType.PowerPoint;
  if (inPowerPoint) {
    setStatus("Ready. Choose an image to begin.", "info");
  } else {
    useSelectionBtn.disabled = true;
    insertBtn.title = "Open this add-in inside PowerPoint to insert images.";
    setStatus(
      "Running outside PowerPoint — removal works, but inserting is disabled.",
      "warn",
    );
  }
});

// --- Input: file picker + drag & drop -------------------------------------
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) setSource(file);
});

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("dropzone--over");
  }),
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dropzone--over");
  }),
);
dropzone.addEventListener("drop", (e) => {
  const file = (e as DragEvent).dataTransfer?.files?.[0];
  if (file && file.type.startsWith("image/")) setSource(file);
});

// --- Input: image already on the slide ------------------------------------
useSelectionBtn.addEventListener("click", async () => {
  try {
    setStatus("Reading the selected shape…", "info", true);
    const base64 = await getSelectedImageBase64();
    if (!base64) {
      setStatus("Select an image on the slide first, then try again.", "warn");
      return;
    }
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    setSource(blob);
    setStatus("Got it. Now click “Remove background”.", "ok");
  } catch (err) {
    setStatus(`Couldn't read the selection: ${asMessage(err)}`, "err");
  }
});

// --- Action: remove background (server-side) ------------------------------
removeBtn.addEventListener("click", async () => {
  if (!sourceBlob) return;
  removeBtn.disabled = true;
  insertBtn.disabled = true;

  inFlight?.abort();
  inFlight = new AbortController();

  try {
    setStatus("Removing background on the server…", "info", true);
    resultBlob = await removeBackgroundViaApi(sourceBlob, inFlight.signal);
    showImage(resultImg, resultBlob);
    setStatus("Done. Insert it onto your slide.", "ok");
    insertBtn.disabled = !inPowerPoint;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    setStatus(`Background removal failed: ${asMessage(err)}`, "err");
  } finally {
    removeBtn.disabled = false;
  }
});

// --- Action: insert onto slide --------------------------------------------
insertBtn.addEventListener("click", async () => {
  if (!resultBlob) return;
  insertBtn.disabled = true;
  try {
    setStatus("Inserting onto slide…", "info", true);
    await insertImageOntoSlide(resultBlob);
    setStatus("Inserted. ✨", "ok");
  } catch (err) {
    setStatus(`Insert failed: ${asMessage(err)}`, "err");
  } finally {
    insertBtn.disabled = false;
  }
});

// --- Cleanup --------------------------------------------------------------
window.addEventListener("pagehide", () => {
  inFlight?.abort();
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
});
