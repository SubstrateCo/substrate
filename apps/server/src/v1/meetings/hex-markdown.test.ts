import { readHexMarkdown } from "./hex-markdown.ts";
import { expect, test } from "bun:test";
const file = [
  "# Shift review",
  "",
  "- **Date:** Tuesday, April 8, 2025, 9:12 AM",
  "- **Duration:** 06:17",
  "- **App:** Slack Huddle",
  "",
  "<!-- hex:notes -->",
  "## Summary",
  "A new checklist.",
  "_Written by example/model through OpenCode._",
  "<!-- /hex:notes -->",
  "",
  "## Transcript",
  "",
  "**You** · 00:06",
  "Hello.",
  "",
  "**Them** · 00:06",
  "Hi.",
].join("\r\n");
test("retains the original, source-local clock and repeated speaker timestamps", () => {
  const r = readHexMarkdown(file, "chosen");
  expect([r.localStart, r.startMs, r.durationMs, r.platform, r.notes, r.credit]).toEqual([
    "2025-04-08T09:12:00",
    null,
    377_000,
    "Slack Huddle",
    "A new checklist.",
    "example/model through OpenCode.",
  ]);
  expect(r.raw).toBe(file);
  expect(r.turns.map((t) => [t.offsetMs, t.speaker, t.text])).toEqual([
    [6000, "You", "Hello."],
    [6000, "Them", "Hi."],
  ]);
  expect(r.people[1].key).toBeNull();
});
test("rejects invalid dates, broken turns and incomplete notes before a write", () => {
  for (const input of [
    file.replace("April 8", "February 30"),
    file.replace("00:06", "00:75"),
    file.replace("<!-- /hex:notes -->", ""),
  ])
    expect(() => readHexMarkdown(input, "file")).toThrow();
});
