import { wakeKind, wakeSessionKey } from "./wake-kind";
import { expect, test } from "bun:test";

const none = { mentioned: false, directMessage: false, workedInThread: false, disabled: [] };

test("a mention wins over a DM, and a DM over a thread the agent worked in", () => {
  expect(wakeKind(none)).toBeUndefined();
  expect(wakeKind({ ...none, workedInThread: true })).toBe("thread_reply");
  expect(wakeKind({ ...none, directMessage: true, workedInThread: true })).toBe("direct_message");
  expect(wakeKind({ ...none, mentioned: true, directMessage: true, workedInThread: true })).toBe(
    "mention",
  );
});

test("a disabled trigger stops the wake without falling back to a weaker reason", () => {
  expect(wakeKind({ ...none, mentioned: true, directMessage: true, disabled: ["mention"] })).toBe(
    undefined,
  );
  expect(wakeKind({ ...none, directMessage: true, disabled: ["mention"] })).toBe("direct_message");
  expect(wakeKind({ ...none, workedInThread: true, disabled: ["thread_reply"] })).toBeUndefined();
});

test("DMs share one session per conversation; other places use one per thread root", () => {
  const root = { id: "m1", conversationId: "c1", threadId: null };
  const reply = { id: "m2", conversationId: "c1", threadId: "m1" };
  expect(wakeSessionKey("dm", reply)).toBe(wakeSessionKey("dm", root));
  expect(wakeSessionKey("channel", reply)).toBe(wakeSessionKey("channel", root));
  expect(wakeSessionKey("group", root)).not.toBe(wakeSessionKey("dm", root));
});
