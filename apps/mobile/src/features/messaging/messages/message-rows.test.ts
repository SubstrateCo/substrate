import { messageRows, timelineFromPages } from "./message-rows";
import { describe, expect, test } from "bun:test";

const message = (
  id: string,
  createdAt: string,
  author = "a",
  authorType: "human" | "agent" = "human",
) => ({
  id,
  createdAt,
  authorActorEntityId: author,
  authorName: author,
  authorType,
});

describe("message rows", () => {
  test("groups close messages from one person and breaks on a new day", () => {
    const rows = messageRows([
      message("1", "2026-11-24T10:00:00Z"),
      message("2", "2026-11-24T10:01:00Z"),
      message("3", "2026-11-25T10:02:00Z"),
    ]);
    expect(rows.map((row) => row.grouped)).toEqual([false, true, false]);
    expect(rows.map((row) => row.newDay)).toEqual([true, false, true]);
  });

  test("agent messages keep their header", () => {
    const rows = messageRows([
      message("1", "2026-11-24T10:00:00Z", "bot", "agent"),
      message("2", "2026-11-24T10:00:10Z", "bot", "agent"),
    ]);
    expect(rows[1]!.grouped).toBe(false);
  });

  test("older pages come first and overlapping rows appear once", () => {
    const latest = [message("3", "c"), message("4", "d")];
    const older = [message("1", "a"), message("2", "b"), message("3", "c")];
    expect(timelineFromPages([latest, older]).map((row) => row.id)).toEqual(["1", "2", "3", "4"]);
  });
});
