import type { VoiceErrorCode } from "@/lib/voice/types";

/**
 * Single source of truth for turning a VoiceErrorCode into an HTTP status and a user-facing
 * message, shared by /api/voice/stt and /api/voice/tts. Only `not_configured` is treated as
 * "voice isn't available" by the client — every other code is a single failed attempt, so the
 * wording always leaves room for "try again" alongside the text fallback.
 */
const MESSAGES: Record<VoiceErrorCode, string> = {
  not_configured: "Voice isn't available in this deployment yet. You can keep using text.",
  invalid_api_key: "Voice is temporarily unavailable (configuration issue). You can keep going with text, or try voice again shortly.",
  insufficient_quota: "Voice is temporarily unavailable — the voice service has reached its usage limit. You can keep going with text.",
  rate_limited: "Voice is briefly busy. Try again in a few seconds, or keep going with text.",
  model_unavailable: "Voice is temporarily unavailable (configuration issue). You can keep going with text.",
  permission_denied: "Voice is temporarily unavailable (configuration issue). You can keep going with text.",
  bad_request: "Couldn't process that. Please try again, or keep going with text.",
  network_error: "Couldn't reach the voice service. Check your connection and try again, or keep going with text.",
  provider_unavailable: "The voice service is temporarily unavailable. You can keep going with text.",
  unknown: "Voice isn't responding right now. You can try again, or keep going with text.",
};

const STATUS: Record<VoiceErrorCode, number> = {
  not_configured: 503,
  invalid_api_key: 500,
  insufficient_quota: 503,
  rate_limited: 429,
  model_unavailable: 500,
  permission_denied: 500,
  bad_request: 400,
  network_error: 502,
  provider_unavailable: 502,
  unknown: 502,
};

export function voiceErrorResponseBody(code: VoiceErrorCode): { status: number; error: string; code: VoiceErrorCode } {
  return { status: STATUS[code], error: MESSAGES[code], code };
}
