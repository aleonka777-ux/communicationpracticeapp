import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

/**
 * Regression coverage for the "Manual Card Navigation Responsiveness" bugfix. Investigation ruled
 * out a click/navigation-firing defect: the whole card is already wrapped in a single next/link
 * with no nested interactive element that could intercept the pointer event or produce invalid
 * nested-anchor markup. These are static structural checks of that HTML-validity/click-interception
 * risk (not a syntax-matching assertion) — the actual fix (a dedicated loading.tsx) is covered
 * separately in manualDetailLoading.test.tsx, since that page.tsx is an async Server Component
 * that can't be rendered directly in this repo's test environment.
 */
const source = readFileSync("src/app/admin/manual/page.tsx", "utf8");

function extractCardLinkBlock(src: string): string {
  const linkStart = src.indexOf("<Link key={version.id}");
  expect(linkStart, "expected a <Link key={version.id} ...> wrapping each Manual card").toBeGreaterThan(-1);
  const linkEnd = src.indexOf("</Link>", linkStart);
  expect(linkEnd, "expected a matching closing </Link>").toBeGreaterThan(linkStart);
  return src.slice(linkStart, linkEnd);
}

describe("Manual list card navigation", () => {
  const block = extractCardLinkBlock(source);

  it("targets the correct per-version detail URL", () => {
    expect(block).toMatch(/href=\{`\/admin\/manual\/\$\{version\.id\}`\}/);
  });

  it("wraps the entire card (not just a label/icon) so the whole card area is clickable", () => {
    expect(block).toMatch(/<Card\b/);
    expect(block).toMatch(/<\/Card>\s*$/);
  });

  it("contains no nested interactive element that could intercept the click or produce invalid nested-anchor markup", () => {
    expect(block).not.toMatch(/<a[\s>]/);
    // Exactly one <Link — the outer wrapper itself; no second, nested Link inside it.
    expect((block.match(/<Link\b/g) ?? []).length).toBe(1);
    expect(block).not.toMatch(/<button[\s>]/);
    expect(block).not.toMatch(/<Button\b/);
  });

  it("does not set pointer-events:none or an onClick that could prevent the intended navigation", () => {
    expect(block).not.toMatch(/pointer-events-none/);
    expect(block).not.toMatch(/onClick/);
    expect(block).not.toMatch(/preventDefault/);
  });
});
