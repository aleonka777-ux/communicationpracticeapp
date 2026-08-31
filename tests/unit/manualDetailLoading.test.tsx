import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ManualVersionDetailLoading from "@/app/admin/manual/[id]/loading";

/**
 * Regression coverage for the "Manual Card Navigation Responsiveness" bugfix. Root cause: the
 * only loading boundary in scope (src/app/admin/loading.tsx) is mounted at the shared /admin
 * layout level, so a client-side navigation from the sibling /admin/manual list page to a
 * specific version does not re-trigger it — the previous page just sits there, looking like the
 * click did nothing, until the slow fetch (the version row plus its full parsed block set)
 * finally resolves. A loading.tsx scoped to this exact [id] segment mounts a fresh Suspense
 * boundary on every navigation into it, so the fallback below is guaranteed to show immediately.
 */
describe("Route has immediate loading feedback during Manual detail navigation", () => {
  it("renders visible loading feedback", () => {
    render(<ManualVersionDetailLoading />);
    expect(screen.getByText(/loading manual/i)).toBeInTheDocument();
  });

  it("renders a status role so the feedback is announced immediately, not just visually present", () => {
    render(<ManualVersionDetailLoading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
