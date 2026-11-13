import { failureTargets } from "./k6/lib/failure-targets";
import { expect, test } from "bun:test";

test("request diagnostics retain resource targets without leaking credentials or content", () => {
  expect(
    failureTargets({
      organizationId: "org",
      conversationId: "conversation",
      messageIds: ["message"],
      email: "private@example.test",
      password: "secret",
      body: "Private message",
      token: "session",
    }),
  ).toEqual({ organizationId: "org", conversationId: "conversation", messageIds: ["message"] });
  expect(failureTargets({ email: "private@example.test", password: "secret" })).toEqual({});
});
