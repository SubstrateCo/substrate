import type { Actor } from "./fixtures";
import { expect, type Page } from "@playwright/test";

export async function uploadMeeting(page: Page, raw: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import Hex file" }).click();
  await (
    await chooser
  ).setFiles({ name: "meeting.md", mimeType: "text/markdown", buffer: Buffer.from(raw) });
}
export async function meetingImporter(actor: Actor) {
  const session = await (await actor.request.get("/api/auth/get-session")).json();
  const params = { organizationId: actor.organizationId, expectedUserId: session.user.id };
  return async (raw: string) => {
    const response = await actor.request.post("/api/v1/meetings/import", { params, data: { raw } });
    expect(response.ok(), await response.text()).toBe(true);
  };
}

export function meetingExport(
  title: string,
  day: number,
  hour: number,
  summary = "Check the latch at 00:13.",
) {
  return [
    `# ${title}`,
    "",
    `- **Date:** November ${day}, 2026, ${hour}:00 AM`,
    "- **Duration:** 06:17",
    "- **App:** Slack Huddle",
    "",
    "<!-- hex:notes -->",
    "## Summary",
    summary,
    "_Written by Example model._",
    "<!-- /hex:notes -->",
    "",
    "## Transcript",
    "",
    "**You** · 00:06",
    "Hello.",
    "",
    "**Them** · 00:06",
    "Hello again.",
    "",
    "**Them** · 00:13",
    "The violet latch is closed.",
  ].join("\r\n");
}
