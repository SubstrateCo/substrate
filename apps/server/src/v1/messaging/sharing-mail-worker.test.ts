import { SharingMailWorker } from "./sharing-mail-worker";
import { expect, test } from "bun:test";

test("one worker coalesces concurrent triggers without blocking another instance", async () => {
  const gate = Promise.withResolvers<void>();
  let claims = 0;
  const worker = new SharingMailWorker({
    claim: async () => {
      claims++;
      await gate.promise;
      return null;
    },
    send: async () => {},
    finish: async () => {},
    reportFailure: () => {},
  });
  let otherClaims = 0;
  const other = new SharingMailWorker({
    claim: async () => {
      otherClaims++;
      return null;
    },
    send: async () => {},
    finish: async () => {},
    reportFailure: () => {},
  });
  worker.trigger();
  worker.trigger();
  other.trigger();
  await other.idle();
  expect(claims).toBe(1);
  expect(otherClaims).toBe(1);
  gate.resolve();
  await worker.idle();
  worker.trigger();
  await worker.idle();
  expect(claims).toBe(2);
});

test("failed sends record an unsuccessful delivery attempt and permit later triggers", async () => {
  const invitation = {
    id: "invitation",
    email: "test@example.test",
    attempt: 1,
    name: "Shared",
    organizationName: "Partner",
  };
  let available = true;
  const finished: boolean[] = [];
  const failures: string[] = [];
  const worker = new SharingMailWorker({
    claim: async () => {
      if (!available) return null;
      available = false;
      return invitation;
    },
    send: async () => {
      throw new Error("SMTP unavailable");
    },
    finish: async (_, sent) => {
      finished.push(sent);
    },
    reportFailure: (message) => {
      failures.push(message);
    },
  });
  worker.trigger();
  await worker.idle();
  expect(finished).toEqual([false]);
  expect(failures).toHaveLength(1);
  available = true;
  worker.trigger();
  await worker.idle();
  expect(finished).toEqual([false, false]);
});

test("a failed claim is reported and does not block the next flush", async () => {
  let fail = true;
  let failures = 0;
  let claimed = 0;
  const worker = new SharingMailWorker({
    claim: async () => {
      claimed++;
      if (fail) throw new Error("Database unavailable");
      return null;
    },
    send: async () => {},
    finish: async () => {},
    reportFailure: () => {
      failures++;
    },
  });
  worker.trigger();
  await worker.idle();
  expect(failures).toBe(1);
  fail = false;
  worker.trigger();
  await worker.idle();
  expect(claimed).toBe(2);
  expect(failures).toBe(1);
});
