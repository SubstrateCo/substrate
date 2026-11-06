import { expect, test } from "bun:test";
import { failure } from "@startup-os/contracts/result";
import { listConversations, listMessages, sendMessage } from "./service";

test("messaging reads validate input inside the result boundary", async () => {
  const headers = new Headers();
  expect(await listConversations(headers, { organizationId: "" })).toEqual(
    failure("INVALID_INPUT", "Invalid request input."),
  );
  expect(await listMessages(headers, { organizationId: "org", conversationId: "invalid" })).toEqual(
    failure("INVALID_INPUT", "Invalid request input."),
  );
});

test("message writes reject missing origins as service failures", async () => {
  expect(
    await sendMessage(new Headers(), {
      organizationId: "org",
      conversationId: "00000000-0000-4000-8000-000000000001",
      body: "hello",
    }),
  ).toEqual(failure("FORBIDDEN", "Invalid request origin."));
});
