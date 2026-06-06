import { removeBackgroundViaApi } from "../api/removeBackground";
import { insertImageOntoSlide, getSelectedImageBase64 } from "../office/insertImage";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const stagePick = $("stage-pick");
const stageImage = $("stage-image");
const dropzone = $("dropzone");
const fileInput = $<HTMLInputElement>("file-input");
const useSelectionBtn = $<HTMLButtonElement>("use-selection");
const viewer = $("viewer");
const preview = $<HTMLImageElement>("preview");
const overlay = $("overlay");
const overlayText = $("overlay-text");
const toggle = $("toggle");
const removeBtn = $<HTMLButtonElement>("remove-btn");
const insertBtn = $<HTMLButtonElement>("insert-btn");
const downloadBtn = $<HTMLButtonElement>("download-btn");
const resetBtn = $<HTMLButtonElement>("reset-btn");
const statusEl = $("status");

type View = "original" | "result";
type Stage = "pick" | "picked" | "processing" | "result" | "error";

let inPowerPoint = false;
let sourceBlob: Blob | null = null;
let resultBlob: Blob | null = null;
let sourceUrl: string | null = null;
let resultUrl: string | null = null;
let inFlight: AbortController | null = null;

// --- Helpers --------------------------------------------------------------
const show = (el: HTMLElement, on: boolean) => (el.hidden = !on);
const asMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

function setStatus(msg = "", kind: "info" | "ok" | "warn" | "err" = "info") {
  statusEl.hidden = !msg;
  statusEl.textContent = msg;
  statusEl.className = `status status--${kind}`;
}

function revokeUrls() {
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  sourceUrl = resultUrl = null;
}

function setView(view: View) {
  const url = view === "result" ? resultUrl : sourceUrl;
  if (url) preview.src = url;
  viewer.classList.toggle("viewer--checker", view === "result");
  toggle
    .querySelectorAll("button")
    .forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
}

function render(stage: Stage) {
  show(stagePick, stage === "pick");
  show(stageImage, stage !== "pick");
  show(overlay, stage === "processing");
  show(toggle, stage === "result");
  show(removeBtn, stage === "picked" || stage === "error");
  show(insertBtn, stage === "result" && inPowerPoint);
  show(downloadBtn, stage === "result");
  show(resetBtn, stage === "picked" || stage === "result" || stage === "error");
  removeBtn.textContent = stage === "error" ? "Try again" : "Remove background";
  // Outside PowerPoint, Download becomes the primary action.
  downloadBtn.className = `btn ${inPowerPoint ? "btn--secondary" : "btn--primary"}`;
}

// --- Input ----------------------------------------------------------------
function setSource(blob: Blob) {
  revokeUrls();
  sourceBlob = blob;
  resultBlob = null;
  sourceUrl = URL.createObjectURL(blob);
  preview.src = sourceUrl;
  viewer.classList.remove("viewer--checker");
  preview.alt = "Original image";
  setStatus("");
  render("picked");
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) setSource(file);
  fileInput.value = ""; // allow re-picking the same file
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

useSelectionBtn.addEventListener("click", async () => {
  try {
    useSelectionBtn.disabled = true;
    setStatus("Reading the selected image…", "info");
    const base64 = await getSelectedImageBase64();
    if (!base64) {
      setStatus("Select a picture on the slide first, then try again.", "warn");
      return;
    }
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    setSource(blob);
  } catch (err) {
    setStatus(`Couldn't read the selection: ${asMessage(err)}`, "err");
  } finally {
    useSelectionBtn.disabled = false;
  }
});

// --- Actions --------------------------------------------------------------
async function runRemove() {
  if (!sourceBlob) return;
  inFlight?.abort();
  inFlight = new AbortController();
  setStatus("");
  setView("original");
  render("processing");
  overlayText.textContent = "Removing background…";
  try {
    resultBlob = await removeBackgroundViaApi(sourceBlob, inFlight.signal);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(resultBlob);
    preview.alt = "Image with the background removed";
    setView("result");
    render("result");
    setStatus(inPowerPoint ? "Done! Insert it onto your slide." : "Done!", "ok");
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    render("error");
    setStatus(`Couldn't remove the background. ${asMessage(err)}`, "err");
  }
}

removeBtn.addEventListener("click", runRemove);

insertBtn.addEventListener("click", async () => {
  if (!resultBlob) return;
  insertBtn.disabled = true;
  try {
    setStatus("Inserting onto your slide…", "info");
    await insertImageOntoSlide(resultBlob);
    setStatus("Inserted onto your slide. ✨", "ok");
  } catch (err) {
    setStatus(`Insert failed: ${asMessage(err)}`, "err");
  } finally {
    insertBtn.disabled = false;
  }
});

downloadBtn.addEventListener("click", () => {
  if (!resultUrl) return;
  const a = document.createElement("a");
  a.href = resultUrl;
  a.download = "clean-cut.png";
  a.click();
});

resetBtn.addEventListener("click", () => {
  inFlight?.abort();
  revokeUrls();
  sourceBlob = resultBlob = null;
  preview.removeAttribute("src");
  setStatus("");
  render("pick");
});

// --- Bootstrap ------------------------------------------------------------
Office.onReady(({ host }) => {
  inPowerPoint = host === Office.HostType.PowerPoint;
  if (!inPowerPoint) {
    useSelectionBtn.hidden = true;
  }
  render("pick");
});

window.addEventListener("pagehide", () => {
  inFlight?.abort();
  revokeUrls();
});
