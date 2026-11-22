import { HarnessError } from "../errors.ts";
import { acpAuthRequired } from "./api.ts";
import { native } from "./request-errors.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

test("successful requests return their result", async () => {
  expect(await native(async () => "ready")).toBe("ready");
});

test("request errors preserve their cause and use the expected harness code", async () => {
  const existing = new HarnessError("invalid-response", "Bad answer");
  for (const [cause, code, message] of [
    [{ code: -32000 }, acpAuthRequired, "Sign in to the agent first."],
    [new Error("Request failed"), "native-request", "Request failed"],
    ["unknown failure", "native-request", "ACP request failed."],
  ] as const) {
    await rejects(
      native(() => Promise.reject(cause)),
      (error: Error) => {
        expect(error).toBeInstanceOf(HarnessError);
        expect(error).toMatchObject({ code, message, cause });
        return true;
      },
    );
  }
  await rejects(
    native(() => Promise.reject(existing)),
    (error: Error) => error === existing,
  );
});

test("a closed connection takes precedence over the original error", async () => {
  const cause = new HarnessError(acpAuthRequired, "Sign in");
  await rejects(
    native(() => Promise.reject(cause), AbortSignal.abort()),
    (error: Error) => {
      expect(error).toMatchObject({
        code: "disconnected",
        message: "The ACP connection closed.",
        cause,
      });
      return true;
    },
  );
});
