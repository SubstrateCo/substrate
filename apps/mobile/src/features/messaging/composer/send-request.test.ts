import { sendRequestFor } from "./send-request";
import { describe, expect, test } from "bun:test";

describe("send request", () => {
  let next = 0;
  const createId = () => `id-${++next}`;

  test("a retry of the same content reuses the request ID", () => {
    const first = sendRequestFor(undefined, "hello", ["file-1"], createId);
    expect(sendRequestFor(first, "hello", ["file-1"], createId).id).toBe(first.id);
  });

  test("changed text or files get a new request ID", () => {
    const first = sendRequestFor(undefined, "hello", [], createId);
    expect(sendRequestFor(first, "hello!", [], createId).id).not.toBe(first.id);
    expect(sendRequestFor(first, "hello", ["file-2"], createId).id).not.toBe(first.id);
  });
});
