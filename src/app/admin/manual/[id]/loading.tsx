import { LoadingState } from "@/components/ui/state";

/**
 * Dedicated loading boundary for this dynamic segment (see CLAUDE.md Stage B "Manual Card
 * Navigation Responsiveness" fix). The shared src/app/admin/loading.tsx boundary lives at the
 * /admin layout level and is already mounted while browsing sibling admin routes (e.g. the
 * /admin/manual list) — React does not re-show an already-mounted Suspense boundary's fallback
 * for a transition-based navigation, so clicking from the list to a specific version produced no
 * visible feedback while this page's async Server Component fetched the version row and its full
 * parsed block set (potentially all 184 blocks' bodies) — a genuinely new navigation looked like a
 * dead click. A loading.tsx scoped to this [id] segment creates its own boundary that mounts fresh
 * on every navigation into it, so React shows this fallback immediately rather than leaving the
 * previous page visible and unresponsive-looking.
 */
export default function ManualVersionDetailLoading() {
  return <LoadingState label="Loading Manual…" />;
}
