import { inFlightReads } from "./in-flight";
import { expect, test } from "bun:test";

test("a read is running until it settles, for its owner and key only", async () => {
  const reads = inFlightReads<object, boolean>();
  const owner = {};
  const read = Promise.resolve(true);
  const tracked = reads.track(owner, "a", read);
  expect(reads.running(owner, "a")).toBe(read);
  expect(reads.running(owner, "b")).toBeUndefined();
  expect(reads.running({}, "a")).toBeUndefined();
  expect(await tracked).toBe(true);
  expect(reads.running(owner, "a")).toBeUndefined();
});

test("an older read that settles late does not untrack the newer one", async () => {
  const reads = inFlightReads<object, boolean>();
  const owner = {};
  let finishOlder!: (value: boolean) => void;
  const older = reads.track(owner, "a", new Promise<boolean>((resolve) => (finishOlder = resolve)));
  const newer = new Promise<boolean>(() => {});
  void reads.track(owner, "a", newer);
  finishOlder(false);
  await older;
  expect(reads.running(owner, "a")).toBe(newer);
});

test("a failed read stops being tracked", async () => {
  const reads = inFlightReads<object, boolean>();
  const owner = {};
  const outcome = await reads.track(owner, "a", Promise.reject(new Error("offline"))).then(
    () => "resolved",
    () => "rejected",
  );
  expect(outcome).toBe("rejected");
  expect(reads.running(owner, "a")).toBeUndefined();
});
