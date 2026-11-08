import { failure } from "@startup-os/contracts/result";

import { sendMessage } from "./service";
import { expect, test } from "bun:test";

test("message writes reject missing origins as service failures", async () => {
  expect(
    await sendMessage(new Headers(), {
      organizationId: "org",
      conversationId: "00000000-0000-4000-8000-000000000001",
      body: "hello",
    }),
  ).toEqual(failure("FORBIDDEN", "Invalid request origin."));
});
