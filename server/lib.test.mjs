import { describe, it, expect } from "vitest";
import { pickImageUrl } from "./lib.mjs";

describe("pickImageUrl", () => {
  it("returns the url from a single FileData object", () => {
    expect(pickImageUrl({ url: "https://x/z.png" })).toBe("https://x/z.png");
  });

  it("returns the only url from a single-output array", () => {
    expect(pickImageUrl([{ url: "https://x/y.png" }])).toBe("https://x/y.png");
  });

  it("returns the cutout (last) url from an ImageSlider [original, cutout] pair", () => {
    expect(
      pickImageUrl([
        [{ url: "https://x/original.png" }, { url: "https://x/cutout.png" }],
      ]),
    ).toBe("https://x/cutout.png");
  });

  it("accepts a plain string", () => {
    expect(pickImageUrl(["https://x/s.png"])).toBe("https://x/s.png");
  });

  it("returns null when there's nothing usable", () => {
    expect(pickImageUrl(undefined)).toBeNull();
    expect(pickImageUrl([])).toBeNull();
    expect(pickImageUrl([{}])).toBeNull();
    expect(pickImageUrl([null])).toBeNull();
  });
});
