import { createSessionRevalidator, readUncachedSession } from "./revalidation";
import { expect, test } from "bun:test";

test("boundary validation explicitly bypasses Better Auth's session cookie cache", async () => {
  let uncached = false;
  const session = await readUncachedSession<{ userId: string }>(async (options) => {
    uncached = options.query.disableCookieCache;
    return { data: null, error: null };
  });
  expect(uncached).toBe(true);
  expect(session).toBeNull();
});

test("revocation closes the private boundary until the authoritative read replaces cached identity", async () => {
  const fresh = Promise.withResolvers<{ userId: string } | null>();
  let open = true;
  let privateData = "private content";
  let session: { userId: string } | null = { userId: "revoked" };
  let reads = 0;
  const revalidate = createSessionRevalidator({
    close: () => {
      open = false;
    },
    clear: () => {
      privateData = "";
    },
    read: () => {
      reads++;
      return fresh.promise;
    },
    publish: (value) => {
      session = value;
    },
    open: () => {
      open = true;
    },
  });
  const first = revalidate();
  const repeated = revalidate();
  expect(open).toBe(false);
  expect(privateData).toBe("");
  expect(reads).toBe(1);
  fresh.resolve(null);
  await Promise.all([first, repeated]);
  expect(session).toBeNull();
  expect(open).toBe(true);
  expect(reads).toBe(1);
});

test("a failed uncached read never reopens the old private session", async () => {
  let session: string | null = "cached identity";
  let visible: string | null = null;
  const revalidate = createSessionRevalidator<string>({
    close() {},
    clear() {},
    read: async () => {
      throw new Error("offline");
    },
    publish: (value) => {
      session = value;
    },
    open: () => {
      visible = session;
    },
  });
  expect(revalidate()).rejects.toThrow("offline");
  await Promise.resolve();
  expect(visible).toBeNull();
  expect(session).toBeNull();
});
