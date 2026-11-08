import { failure } from "@startup-os/contracts/result";

import { createTaskFromMessage } from "./service";
import { expect, test } from "bun:test";

test("source-task creation rejects foreign origins as service failures", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  expect(
    await createTaskFromMessage(new Headers({ origin: "https://foreign.test" }), {
      organizationId: "org",
      messageId: id,
      requestId: id,
      projectEntityId: id,
      title: "Launch",
    }),
  ).toEqual(failure("FORBIDDEN", "Invalid request origin."));
});
