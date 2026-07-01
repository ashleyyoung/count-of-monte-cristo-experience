import { describe, it, expect } from "vitest";
import { shouldPreferAltoOverTexteBrut } from "../translate/french-source";

describe("shouldPreferAltoOverTexteBrut", () => {
  const altoPaged =
    "--- Page 1 ---\nfoo\n\n--- Page 2 ---\nbar\n\n--- Page 3 ---\nbaz\n\n--- Page 4 ---\nqux";

  it("prefers ALTO when texteBrut is one undivided blob", () => {
    expect(shouldPreferAltoOverTexteBrut("x".repeat(500), altoPaged)).toBe(true);
  });

  it("keeps texteBrut when it already has page markers", () => {
    const texteBrutPaged = "--- Page 1 ---\na\n\n--- Page 2 ---\nb";
    expect(shouldPreferAltoOverTexteBrut(texteBrutPaged, altoPaged)).toBe(
      false,
    );
  });

  it("keeps texteBrut when ALTO is missing", () => {
    expect(shouldPreferAltoOverTexteBrut("blob", null)).toBe(false);
  });
});
