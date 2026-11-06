import { failure } from "@startup-os/contracts/result";

import { getMessageLinks, searchContext, createTaskFromMessage } from "./service";
import { expect, test } from "bun:test";

test("context services validate reads and searches inside the result boundary", async () => {
  const headers = new Headers();
  expect(await getMessageLinks(headers, { organizationId: "org", messageId: "invalid" })).toEqual(
    failure("INVALID_INPUT", "Invalid request input."),
  );
  expect(
    await searchContext(headers, { organizationId: "org", query: "Launch", limit: 101 }),
  ).toEqual(failure("INVALID_INPUT", "Invalid request input."));
});

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
