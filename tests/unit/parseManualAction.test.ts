import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the Stage B "Manual post-parse navigation" bugfix. Root cause:
 * parseManualAction used to redirect() to the exact same URL the form was submitted from
 * (/admin/manual/[id] -> parse -> /admin/manual/[id]) — the only self-redirect among the admin
 * Manual/tools/scenarios actions — which hit a Next.js App Router client-navigation edge case,
 * leaving only the surrounding admin layout visible until an unrelated navigation forced a real
 * refetch. The fix removes the self-redirect entirely and relies on revalidatePath, which is what
 * actually makes Next.js refresh the current page's Server Component with the new data — these
 * tests assert that observable behavior (no redirect call, DB layer invoked correctly, the right
 * paths revalidated), not just that a particular line of source is absent.
 */

interface FakeProfile {
  id: string;
  display_name: string;
  role: string;
  created_at: string;
  updated_at: string;
}

const getCurrentProfile = vi.fn<(supabase: unknown) => Promise<FakeProfile>>(async () => ({
  id: "admin-1",
  display_name: "Admin",
  role: "admin",
  created_at: "",
  updated_at: "",
}));

vi.mock("@/lib/db/profiles", () => ({
  getCurrentProfile: (supabase: unknown) => getCurrentProfile(supabase),
  isAdmin: (profile: { role?: string } | null) => profile?.role === "admin",
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({}),
}));

const getManualVersionById = vi.fn<(supabase: unknown, id: string) => Promise<unknown>>();
const recordFailedParseAttempt = vi.fn<
  (supabase: unknown, versionId: string, report: Record<string, unknown>) => Promise<unknown>
>(async () => ({}));
const replaceManualBlocksAndMarkParsed = vi.fn<
  (supabase: unknown, versionId: string, payload: { blocks: unknown[] }) => Promise<unknown>
>(async () => ({}));

vi.mock("@/lib/db/manual", () => ({
  getManualVersionById: (supabase: unknown, id: string) => getManualVersionById(supabase, id),
  getManualVersionByLabel: vi.fn(),
  getManualVersionBySha256: vi.fn(),
  createDraftManualVersion: vi.fn(),
  recordFailedParseAttempt: (supabase: unknown, versionId: string, report: Record<string, unknown>) =>
    recordFailedParseAttempt(supabase, versionId, report),
  replaceManualBlocksAndMarkParsed: (supabase: unknown, versionId: string, payload: { blocks: unknown[] }) =>
    replaceManualBlocksAndMarkParsed(supabase, versionId, payload),
}));

const revalidatePath = vi.fn<(path: string) => void>();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (...args: [string]) => redirect(...args) }));

import { parseManualAction } from "@/lib/admin/manualActions";

function fence(lang: string, body: string): string {
  return "```" + lang + "\n" + body + "\n```";
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const VALID_SOURCE = [fence("yaml", "id: a\ntype: principle\npriority: high"), "Body."].join("\n");
const DUPLICATE_ID_SOURCE = [
  fence("yaml", "id: dup\ntype: principle\npriority: high"),
  "Body.",
  "",
  fence("yaml", "id: dup\ntype: principle\npriority: low"),
  "Body 2.",
].join("\n");

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentProfile.mockResolvedValue({ id: "admin-1", display_name: "Admin", role: "admin", created_at: "", updated_at: "" });
  recordFailedParseAttempt.mockResolvedValue({});
  replaceManualBlocksAndMarkParsed.mockResolvedValue({});
});

describe("successful parse", () => {
  it("does not redirect — it revalidates the detail path so Next.js refreshes the current page in place", async () => {
    getManualVersionById.mockResolvedValue({ id: "v1", status: "draft", source_markdown: VALID_SOURCE });

    await parseManualAction(formData({ id: "v1" }));

    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/manual");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/manual/v1");
  });

  it("persists the newly parsed block set (the refreshed page's data source)", async () => {
    getManualVersionById.mockResolvedValue({ id: "v1", status: "draft", source_markdown: VALID_SOURCE });

    await parseManualAction(formData({ id: "v1" }));

    expect(replaceManualBlocksAndMarkParsed).toHaveBeenCalledOnce();
    const [, versionId, payload] = replaceManualBlocksAndMarkParsed.mock.calls[0]!;
    expect(versionId).toBe("v1");
    expect(payload.blocks).toHaveLength(1);
    expect(recordFailedParseAttempt).not.toHaveBeenCalled();
  });
});

describe("parse failure (fatal structural error)", () => {
  it("does not redirect as though it succeeded", async () => {
    getManualVersionById.mockResolvedValue({ id: "v1", status: "draft", source_markdown: DUPLICATE_ID_SOURCE });

    await parseManualAction(formData({ id: "v1" }));

    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not replace the block set, leaving no half-written state, but still revalidates so the draft/error state is visible", async () => {
    getManualVersionById.mockResolvedValue({ id: "v1", status: "draft", source_markdown: DUPLICATE_ID_SOURCE });

    await parseManualAction(formData({ id: "v1" }));

    expect(replaceManualBlocksAndMarkParsed).not.toHaveBeenCalled();
    expect(recordFailedParseAttempt).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/manual/v1");
  });
});

describe("regression — existing guarantees survive the navigation fix", () => {
  it("still refuses to parse from a lifecycle status that doesn't permit it", async () => {
    getManualVersionById.mockResolvedValue({ id: "v1", status: "active", source_markdown: VALID_SOURCE });

    await expect(parseManualAction(formData({ id: "v1" }))).rejects.toThrow(/does not permit parsing/);

    expect(replaceManualBlocksAndMarkParsed).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("still requires admin authorization", async () => {
    getCurrentProfile.mockResolvedValue({ id: "u1", display_name: "Coach", role: "coach", created_at: "", updated_at: "" });
    getManualVersionById.mockResolvedValue({ id: "v1", status: "draft", source_markdown: VALID_SOURCE });

    await expect(parseManualAction(formData({ id: "v1" }))).rejects.toThrow(/Only admin accounts/);

    expect(getManualVersionById).not.toHaveBeenCalled();
  });
});
