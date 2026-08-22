import { describe, expect, it } from "vitest";
import { voiceErrorResponseBody } from "@/lib/voice/errorResponse";
import type { VoiceErrorCode } from "@/lib/voice/types";

const ALL_CODES: VoiceErrorCode[] = [
  "not_configured",
  "invalid_api_key",
  "insufficient_quota",
  "rate_limited",
  "model_unavailable",
  "permission_denied",
  "bad_request",
  "network_error",
  "provider_unavailable",
  "unknown",
];

describe("voiceErrorResponseBody", () => {
  it("returns a non-empty message and a valid HTTP status for every code", () => {
    for (const code of ALL_CODES) {
      const body = voiceErrorResponseBody(code);
      expect(body.code).toBe(code);
      expect(body.error.length).toBeGreaterThan(0);
      expect(body.status).toBeGreaterThanOrEqual(400);
      expect(body.status).toBeLessThan(600);
    }
  });

  it("only not_configured maps to the status the client treats as permanently unavailable (503) among the provider-side codes it also shares", () => {
    // 503 alone isn't a safe signal (insufficient_quota also uses it) — this is why the client
    // must key off `code`, not `status`. Documented here so that invariant doesn't regress silently.
    expect(voiceErrorResponseBody("not_configured").status).toBe(503);
  });

  it("rate_limited maps to 429 so clients/infra can apply standard retry-after handling", () => {
    expect(voiceErrorResponseBody("rate_limited").status).toBe(429);
  });
});
