import { describe, it, expect, vi, afterEach } from "vitest";
import { removeBackgroundViaApi } from "./removeBackground";

afterEach(() => vi.unstubAllGlobals());

const input = new Blob(["source-image"], { type: "image/png" });

describe("removeBackgroundViaApi", () => {
  it("returns the PNG blob on success", async () => {
    const png = new Blob(["cutout"], { type: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(png, { status: 200, headers: { "Content-Type": "image/png" } }),
      ),
    );
    const out = await removeBackgroundViaApi(input);
    expect(out.type).toBe("image/png");
  });

  it("throws a friendly message when the backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(removeBackgroundViaApi(input)).rejects.toThrow(
      /Couldn't reach the background-removal service/,
    );
  });

  it("surfaces a non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 502, statusText: "Bad Gateway" })),
    );
    await expect(removeBackgroundViaApi(input)).rejects.toThrow(/Service error 502/);
  });

  it("rejects a non-image response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Blob(["<html>"], { type: "text/html" }), {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
      ),
    );
    await expect(removeBackgroundViaApi(input)).rejects.toThrow(/not an image/);
  });

  it("propagates aborts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("aborted", "AbortError");
      }),
    );
    await expect(removeBackgroundViaApi(input)).rejects.toThrow(/aborted/);
  });
});
