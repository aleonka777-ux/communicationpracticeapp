import { test, expect } from "@playwright/test";

/**
 * Full core-loop happy path: sign up, choose a skill, choose a scenario, practise, end the
 * session, view AI-coach feedback, and try again. The AI provider is the deterministic mock
 * (no OPENAI_API_KEY in test environments — see /docs/DECISIONS.md), so this never calls a
 * live model. Requires a real (test) Supabase project with migrations + supabase/seed.sql
 * applied — see README.md "Running tests".
 */
test("login → choose skill → choose scenario → practise → end → feedback → try again", async ({ page }) => {
  test.setTimeout(90_000);

  const uniqueEmail = `e2e-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";

  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Test User");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "What do you want to practise today?" })).toBeVisible();

  await page.getByText("Responding to Aggression").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.getByText("Coworker Blames You for a Mistake").first().click();

  await expect(page.getByRole("button", { name: "Start practice" })).toBeVisible();
  await page.getByRole("button", { name: "Start practice" }).click();

  await expect(page).toHaveURL(/\/practice\/[^/]+$/);
  await expect(page.getByText("I can't believe you did this again")).toBeVisible({ timeout: 15_000 });

  const messageBox = page.getByLabel("Your message");
  await messageBox.fill("I hear that this created extra work — let's figure out how to fix it.");
  await page.getByRole("button", { name: "Send message" }).click();

  // Wait for the mock interlocutor's reply to land in the transcript.
  await expect(page.getByRole("log")).toContainText("I hear you", { timeout: 15_000 });

  await page.getByRole("button", { name: "End practice" }).click();

  await expect(page).toHaveURL(/\/feedback$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /Practice complete/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next practice focus" })).toBeVisible();

  await page.getByRole("link", { name: "Try again" }).click();
  await expect(page).toHaveURL(/\/practice\/setup\/[^/]+$/);
  await expect(page.getByRole("button", { name: "Start practice" })).toBeVisible();
});
