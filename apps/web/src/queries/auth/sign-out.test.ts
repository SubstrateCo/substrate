import { QueryClient } from "@tanstack/react-query";

import { signOutAndClear } from "./sign-out";
import { expect, test } from "bun:test";

test("failed native revocation still clears private state and reports the remote failure", async () => {
  const client = new QueryClient();
  client.setQueryData(["private"], { message: "secret" });
  const offline = new Error("Offline");
  let aborted = false;
  const pending = client
    .query({
      queryKey: ["pending-private"],
      queryFn: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("Cancelled"));
          });
        }),
    })
    .catch(() => {});
  const result = await signOutAndClear(client, () => Promise.reject(offline), true);
  await pending;
  expect(result.revocationError).toBe(offline);
  expect(aborted).toBe(true);
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});

test("failed browser sign-out preserves the session view and reports the failure", async () => {
  const client = new QueryClient();
  client.setQueryData(["private"], "secret");
  const offline = new Error("Offline");
  try {
    expect(
      await signOutAndClear(client, () => Promise.reject(offline), false).catch(
        (error: Error) => error,
      ),
    ).toBe(offline);
    expect(client.getQueryData(["private"])).toBe("secret");
  } finally {
    client.clear();
  }
});

for (const desktop of [true, false]) {
  test(`successful ${desktop ? "native" : "browser"} sign-out clears private state`, async () => {
    const client = new QueryClient();
    client.setQueryData(["private"], "secret");
    expect(await signOutAndClear(client, async () => {}, desktop)).toEqual({
      revocationError: undefined,
    });
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
}
