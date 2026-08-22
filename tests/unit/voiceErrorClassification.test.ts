import { describe, expect, it } from "vitest";
import { APIConnectionError, APIError } from "openai";
import { classifyOpenAIError } from "@/lib/voice/errorClassification";

describe("classifyOpenAIError", () => {
  it("classifies a connection-level failure as network_error", () => {
    const error = new APIConnectionError({ message: "fetch failed" });
    expect(classifyOpenAIError(error).code).toBe("network_error");
  });

  it("classifies 401 as invalid_api_key", () => {
    const error = new APIError(401, { code: "invalid_api_key" }, "Incorrect API key provided", undefined);
    expect(classifyOpenAIError(error).code).toBe("invalid_api_key");
  });

  it("classifies 403 as permission_denied", () => {
    const error = new APIError(403, { code: "insufficient_permissions" }, "You do not have access", undefined);
    expect(classifyOpenAIError(error).code).toBe("permission_denied");
  });

  it("classifies 404 as model_unavailable", () => {
    const error = new APIError(404, { code: "model_not_found" }, "The model does not exist", undefined);
    expect(classifyOpenAIError(error).code).toBe("model_unavailable");
  });

  it("distinguishes insufficient_quota from rate_limited even though both are HTTP 429", () => {
    const quota = new APIError(429, { code: "insufficient_quota", type: "insufficient_quota" }, "You exceeded your current quota", undefined);
    const rateLimit = new APIError(429, { code: "rate_limit_exceeded" }, "Rate limit reached", undefined);
    expect(classifyOpenAIError(quota).code).toBe("insufficient_quota");
    expect(classifyOpenAIError(rateLimit).code).toBe("rate_limited");
  });

  it("classifies a 400 naming the model param as model_unavailable, not a generic bad_request", () => {
    const error = new APIError(400, { code: "model_not_found", param: "model" }, "Unknown model", undefined);
    expect(classifyOpenAIError(error).code).toBe("model_unavailable");
  });

  it("classifies other 400s as bad_request", () => {
    const error = new APIError(400, { code: "invalid_value", param: "file" }, "Invalid file", undefined);
    expect(classifyOpenAIError(error).code).toBe("bad_request");
  });

  it("classifies 5xx as provider_unavailable", () => {
    const error = new APIError(500, {}, "Internal server error", undefined);
    expect(classifyOpenAIError(error).code).toBe("provider_unavailable");
  });

  it("falls back to unknown for an unrecognized status or non-API error", () => {
    const error = new APIError(418, {}, "I'm a teapot", undefined);
    expect(classifyOpenAIError(error).code).toBe("unknown");
    expect(classifyOpenAIError(new Error("something else")).code).toBe("unknown");
    expect(classifyOpenAIError("not even an error").code).toBe("unknown");
    expect(classifyOpenAIError(undefined).code).toBe("unknown");
  });

  it("carries the provider code and request id through for logging", () => {
    const error = new APIError(429, { code: "insufficient_quota" }, "quota", undefined);
    const classified = classifyOpenAIError(error);
    expect(classified.providerCode).toBe("insufficient_quota");
    expect(classified.status).toBe(429);
  });
});
