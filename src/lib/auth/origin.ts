import { headers } from "next/headers";

/**
 * The origin the current request actually arrived on (e.g. "https://communicationpracticeapp
 * .vercel.app" in production, "http://localhost:3000" in dev) — derived from request headers
 * rather than a hardcoded hostname or a new env var, since this repo has no existing canonical
 * site-URL helper to reuse. Vercel's proxy sets x-forwarded-host/x-forwarded-proto correctly;
 * `host` is the fallback for any other environment. Used only to build Supabase auth redirect
 * URLs (see src/lib/auth/actions.ts's requestPasswordResetAction) — never trusted as an
 * authorization input.
 */
export async function getSiteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
