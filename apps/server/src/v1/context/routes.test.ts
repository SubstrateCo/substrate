import { failure } from "@startup-os/contracts/result";

import { createContextRoutes } from "./routes";
import * as services from "./service";
import { expect, mock, test } from "bun:test";

const id = "00000000-0000-4000-8000-000000000001";

test("context routes reject invalid input without invoking services", async () => {
  const spies = {
    getMessageLinks: mock(services.getMessageLinks),
    getMessagePeople: mock(services.getMessagePeople),
    getRelatedContext: mock(services.getRelatedContext),
    getMessageTarget: mock(services.getMessageTarget),
    searchContext: mock(services.searchContext),
    createTaskFromMessage: mock(services.createTaskFromMessage),
    attachWork: mock(services.attachWork),
    detachWork: mock(services.detachWork),
    getActivity: mock(services.getActivity),
    getNotifications: mock(services.getNotifications),
    markRead: mock(services.markRead),
  };
  const app = createContextRoutes(spies);
  for (const path of [
    "/message-links",
    "/message-people",
    "/related",
    "/message-target",
    "/activity",
    "/notifications",
  ]) {
    const response = await app.request(path);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(failure("INVALID_INPUT", "Invalid request input."));
  }
  for (const [method, path] of [
    ["POST", "/search"],
    ["POST", "/source-tasks"],
    ["POST", "/links"],
    ["DELETE", "/links"],
    ["POST", "/notifications/read"],
  ]) {
    const response = await app.request(path!, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: "org" }),
    });
    expect(response.status).toBe(400);
  }
  for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
});

test("context search keeps JSON numbers and booleans and maps authorization failures", async () => {
  const searchContext = mock(async () => failure("FORBIDDEN", "Verify your email to continue."));
  const app = createContextRoutes({ ...services, searchContext });
  const input = { organizationId: "org", query: "Launch", limit: 10, editable: true };
  const response = await app.request("/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual(failure("FORBIDDEN", "Verify your email to continue."));
  expect(searchContext).toHaveBeenCalledWith(expect.any(Headers), input);
});

test("context unlink reads JSON on DELETE and preserves structured IDs", async () => {
  const detachWork = mock(async () => failure("NOT_FOUND", "Item not found or access denied."));
  const app = createContextRoutes({ ...services, detachWork });
  const input = { organizationId: "org", messageId: id, entityId: id };
  const response = await app.request("/links", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual(failure("NOT_FOUND", "Item not found or access denied."));
  expect(detachWork).toHaveBeenCalledWith(expect.any(Headers), input);
});
