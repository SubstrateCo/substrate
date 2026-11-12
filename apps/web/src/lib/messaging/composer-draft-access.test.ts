import { retainConversationDraft } from "./composer-draft-access";
import { expect, test } from "bun:test";

test("ordinary list refreshes retain known discussion drafts but revoke absent ordinary drafts", () => {
  const allowed = new Set(["channel"]);
  const discussions = new Set(["task-discussion"]);
  expect(retainConversationDraft("task-discussion", allowed, discussions)).toBe(true);
  expect(retainConversationDraft("channel", allowed, discussions)).toBe(true);
  expect(retainConversationDraft("left-channel", allowed, discussions)).toBe(false);
});

test("a selected discussion read revokes only that discussion's inaccessible draft", () => {
  const discussions = new Set(["first", "second"]);
  expect(retainConversationDraft("first", new Set(), discussions, "first")).toBe(false);
  expect(retainConversationDraft("second", new Set(), discussions, "first")).toBe(true);
  expect(retainConversationDraft("first", new Set(["first"]), discussions, "first")).toBe(true);
});
