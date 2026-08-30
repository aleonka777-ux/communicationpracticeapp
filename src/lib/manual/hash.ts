import { createHash } from "crypto";

/** Deterministic content hash used for exact-duplicate-upload detection. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
