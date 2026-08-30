/**
 * Restricts a caller-supplied "where to go next" value to a same-origin local application path.
 * Used by both the ordinary login form's `next` param and the auth callback's `next` param — see
 * CLAUDE.md Stage B.2. Resolving against a fixed dummy origin is what actually catches the tricky
 * cases (protocol-relative "//evil.example", backslash variants the WHATWG URL parser treats the
 * same way, "javascript:", absolute "https://..."): if the resolved origin isn't the dummy one,
 * the input would have taken the browser somewhere else entirely.
 */
const SANITIZE_BASE = "https://sanitize.invalid";

export function sanitizeNextPath(next: string | null | undefined, fallback = "/home"): string {
  const trimmed = next?.trim();
  if (!trimmed || !trimmed.startsWith("/")) return fallback;

  let resolved: URL;
  try {
    resolved = new URL(trimmed, SANITIZE_BASE);
  } catch {
    return fallback;
  }

  if (resolved.origin !== SANITIZE_BASE) return fallback;

  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  return path || fallback;
}
