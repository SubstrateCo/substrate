import { mailboxSyncJobs } from "./sync-jobs.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

test("overlapping wakes share one follow-up, and cancelling one mailbox discards only its pending work", async () => {
  const jobs = mailboxSyncJobs();
  const first = Promise.withResolvers<void>();
  let a = 0;
  let b = 0;
  const runA = async () => {
    if (++a === 1) await first.promise;
  };
  const runB = (signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      b++;
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  const done = jobs.request("a", runA);
  const burst = [jobs.request("a", runA), jobs.request("a", runA)];
  const cancelled = jobs.request("b", runB);
  expect(jobs.request("b", runB)).toBe(cancelled);
  await jobs.cancel("b");
  await cancelled;
  expect(b).toBe(1);
  expect(jobs.has("b")).toBe(false);
  expect(a).toBe(1);
  first.resolve();
  await Promise.all([done, ...burst]);
  expect(a).toBe(2);
  expect(jobs.has("a")).toBe(false);
});

test("paging waits for its mailbox's token rotation; cancellation discards a waiting page without blocking another mailbox", async () => {
  const jobs = mailboxSyncJobs(),
    release = Promise.withResolvers<void>(),
    seen: string[] = [];
  const sync = jobs.request("a", async () => {
    await release.promise;
    seen.push("rotated");
  });
  const page = jobs.run("a", async () => {
    seen.push("paged");
  });
  const abort = new AbortController();
  const expired = rejects(
    jobs.run(
      "a",
      async () => {
        seen.push("expired");
      },
      abort.signal,
    ),
  );
  abort.abort();
  await expired;
  await jobs.run("b", async () => {
    seen.push("other");
  });
  release.resolve();
  await Promise.all([sync, page]);
  await jobs.stop();
  expect(seen).toEqual(["other", "rotated", "paged"]);
});
