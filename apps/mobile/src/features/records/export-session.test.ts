import { resetPrivateState } from "../../auth/private-state";
import { shareRecordExport } from "./export-session";
import { expect, test } from "bun:test";

test("a workspace exit after export bytes load prevents sharing and releases the private file", async () => {
  let shared = false;
  let released = false;
  const work = shareRecordExport(
    async () => {
      resetPrivateState();
      return {
        uri: "private-export",
        release: () => {
          released = true;
        },
      };
    },
    async () => {
      shared = true;
    },
  );
  expect(await work.catch((error: Error) => error)).toBeInstanceOf(Error);
  expect(shared).toBe(false);
  expect(released).toBe(true);
});

test("a canceled export share still releases its private file", async () => {
  let released = false;
  const failure = await shareRecordExport(
    async () => ({
      uri: "private-export",
      release: () => {
        released = true;
      },
    }),
    async () => {
      throw new Error("Canceled");
    },
  ).catch((error: Error) => error);
  expect(failure).toMatchObject({ message: "Canceled" });
  expect(released).toBe(true);
});
