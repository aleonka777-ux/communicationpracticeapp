import { APIConnectionError, APIError } from "openai";
import type { VoiceErrorCode } from "@/lib/voice/types";

export interface ClassifiedVoiceError {
  code: VoiceErrorCode;
  status?: number;
  providerCode?: string | null;
  requestId?: string | null;
}

/**
 * Maps an error thrown by the OpenAI SDK to one of a small, closed set of categories (see
 * VoiceErrorCode) so callers can decide what to tell the user, what to log, and — critically —
 * whether voice should stay enabled. Never trust HTTP status alone: OpenAI reuses 429 for both
 * true rate limiting and quota/billing exhaustion, distinguished only by the response body's
 * `code`/`type` field, so both are checked here.
 */
export function classifyOpenAIError(error: unknown): ClassifiedVoiceError {
  if (error instanceof APIConnectionError) {
    return { code: "network_error" };
  }

  if (error instanceof APIError) {
    const status = error.status;
    const providerCode = error.code ?? null;
    const requestId = error.requestID ?? null;

    if (status === 401) return { code: "invalid_api_key", status, providerCode, requestId };
    if (status === 403) return { code: "permission_denied", status, providerCode, requestId };
    if (status === 404) return { code: "model_unavailable", status, providerCode, requestId };
    if (status === 429) {
      const isQuota = providerCode === "insufficient_quota" || error.type === "insufficient_quota";
      return { code: isQuota ? "insufficient_quota" : "rate_limited", status, providerCode, requestId };
    }
    if (status === 400 || status === 422) {
      const isModelIssue = providerCode === "model_not_found" || error.param === "model";
      return { code: isModelIssue ? "model_unavailable" : "bad_request", status, providerCode, requestId };
    }
    if (typeof status === "number" && status >= 500) {
      return { code: "provider_unavailable", status, providerCode, requestId };
    }
    return { code: "unknown", status, providerCode, requestId };
  }

  return { code: "unknown" };
}
