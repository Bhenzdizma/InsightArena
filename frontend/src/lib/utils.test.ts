import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges plain class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("applies conditional classes based on truthiness", () => {
    expect(cn("base", false && "hidden", true && "visible")).toBe(
      "base visible"
    );
  });

  it("resolves conflicting tailwind spacing classes by keeping the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("resolves conflicting tailwind color classes by keeping the last one", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });
});
