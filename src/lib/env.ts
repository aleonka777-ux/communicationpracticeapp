import { z } from "zod";

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/** Client-safe env vars. Validated once per process; throws loudly on misconfiguration rather than failing silently at request time. */
export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

/**
 * Server-only env vars. Import this file only from server code (route handlers, server
 * components, server actions, src/lib/ai, src/lib/voice, src/lib/supabase/admin). Values are
 * read lazily via getters so a missing optional key (e.g. OPENAI_API_KEY in dev) doesn't crash
 * the whole module graph — callers decide whether the absence is fatal.
 */
export const serverEnv = {
  get supabaseServiceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  },
  get openaiApiKey() {
    return process.env.OPENAI_API_KEY;
  },
  /**
   * Rollback switch for the Realtime voice layer (see /docs/DECISIONS.md "Realtime voice
   * rollout"). Defaults to off so the well-tested batch STT/TTS path keeps serving production
   * until Realtime has been verified; flip to "true" in Vercel once it's ready.
   */
  get realtimeVoiceEnabled() {
    return process.env.REALTIME_VOICE_ENABLED === "true";
  },
  get realtimeModel() {
    return process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1";
  },
  get realtimeVoice() {
    return process.env.OPENAI_REALTIME_VOICE ?? "alloy";
  },
};
