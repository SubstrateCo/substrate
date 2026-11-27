import { createAttentionSession } from "./attention-session.ts";
import { expect, test } from "bun:test";

function fixture() {
  const counts: number[] = [];
  let token = "account-a";
  const identity = { userId: "alice", verified: true };
  const session = createAttentionSession({
    apply: (count) => counts.push(count),
    token: () => token,
    readIdentity: async () => identity,
  });
  return { counts, identity, session, changeToken: () => (token = "account-b") };
}

test("an unverified or different account cannot set the badge", async () => {
  const f = fixture();
  await f.session.set({ userId: "bob", count: 9 });
  f.identity.verified = false;
  await f.session.set({ userId: "alice", count: 3 });
  expect(f.counts).toEqual([]);
});

test("sign-out clears the badge and rejects later calls until the session changes", async () => {
  const f = fixture();
  await f.session.set({ userId: "alice", count: 6 });
  f.session.suspend();
  await f.session.set({ userId: "alice", count: 8 });
  expect(f.counts).toEqual([6, 0]);
  f.session.resume();
  await f.session.set({ userId: "alice", count: 2 });
  expect(f.counts).toEqual([6, 0, 2]);
});

test("an in-flight update cannot restore a cleared badge or cross a cookie change", async () => {
  const f = fixture();
  const pending = f.session.set({ userId: "alice", count: 8 });
  f.session.clear();
  await pending;
  expect(f.counts).toEqual([0]);
  const next = f.session.set({ userId: "alice", count: 9 });
  f.changeToken();
  await next;
  expect(f.counts).toEqual([0]);
});

test("a late update cannot overwrite a more recent count", async () => {
  const first = Promise.withResolvers<{ userId: string; verified: boolean }>();
  const counts: number[] = [];
  let reads = 0;
  const session = createAttentionSession({
    apply: (count) => counts.push(count),
    token: () => "cookie",
    readIdentity: () =>
      ++reads === 1 ? first.promise : Promise.resolve({ userId: "alice", verified: true }),
  });
  const old = session.set({ userId: "alice", count: 9 });
  await session.set({ userId: "alice", count: 2 });
  first.resolve({ userId: "alice", verified: true });
  await old;
  expect(counts).toEqual([2]);
});
