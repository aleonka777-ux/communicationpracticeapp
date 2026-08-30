import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "@/lib/auth/redirect";

describe("Test E — safe redirect (sanitizeNextPath)", () => {
  it("allows a local application path", () => {
    expect(sanitizeNextPath("/auth/update-password")).toBe("/auth/update-password");
  });

  it("preserves query string and hash on an allowed path", () => {
    expect(sanitizeNextPath("/practice/setup/abc?x=1#y")).toBe("/practice/setup/abc?x=1#y");
  });

  it("rejects an absolute external URL", () => {
    expect(sanitizeNextPath("https://evil.example")).toBe("/home");
  });

  it("rejects a protocol-relative URL", () => {
    expect(sanitizeNextPath("//evil.example")).toBe("/home");
  });

  it("rejects a backslash variant of a protocol-relative URL", () => {
    expect(sanitizeNextPath("/\\evil.example")).toBe("/home");
    expect(sanitizeNextPath("\\\\evil.example")).toBe("/home");
  });

  it("rejects a javascript: URL", () => {
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/home");
  });

  it("rejects a value that doesn't start with a slash", () => {
    expect(sanitizeNextPath("home")).toBe("/home");
  });

  it("falls back for empty/missing/whitespace-only input", () => {
    expect(sanitizeNextPath(undefined)).toBe("/home");
    expect(sanitizeNextPath(null)).toBe("/home");
    expect(sanitizeNextPath("")).toBe("/home");
    expect(sanitizeNextPath("   ")).toBe("/home");
  });

  it("honors a custom fallback", () => {
    expect(sanitizeNextPath("https://evil.example", "/login")).toBe("/login");
  });
});
