import { describe, expect, it } from "vitest";
import { splitDateWindows } from "../src/sync.js";

describe("SimpleFIN sync windows", () => {
  it("splits inclusive windows without repeating a boundary date", () => {
    expect(splitDateWindows("2026-01-01", "2026-04-01", 45)).toEqual([
      { start: "2026-01-01", end: "2026-02-15" },
      { start: "2026-02-16", end: "2026-04-01" },
    ]);
  });

  it("keeps a short range in one window", () => {
    expect(splitDateWindows("2026-08-01", "2026-08-12", 45)).toEqual([
      { start: "2026-08-01", end: "2026-08-12" },
    ]);
  });
});
