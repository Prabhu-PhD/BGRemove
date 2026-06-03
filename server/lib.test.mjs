import { describe, it, expect } from "vitest";
import { pickImageUrl } from "./lib.mjs";

describe("pickImageUrl", () => {
  it("reads .url from the first array element", () => {
    expect(pickImageUrl([{ url: "https://x/y.png" }])).toBe("https://x/y.png");
  });

  it("reads .url from a single object", () => {
    expect(pickImageUrl({ url: "https://x/z.png" })).toBe("https://x/z.png");
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
