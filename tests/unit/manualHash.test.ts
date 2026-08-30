import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/manual/hash";

describe("SHA-256 duplicate-upload detection helper", () => {
  it("is deterministic for identical content", () => {
    expect(sha256Hex("hello world")).toBe(sha256Hex("hello world"));
  });

  it("differs for different content", () => {
    expect(sha256Hex("hello world")).not.toBe(sha256Hex("hello world!"));
  });

  it("produces a 64-character lowercase hex digest", () => {
    expect(sha256Hex("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});
