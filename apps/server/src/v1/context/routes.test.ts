import { failure } from "@startup-os/contracts/result";

import { createContextRoutes } from "./routes";
import * as services from "./service";
import { expect, mock, test } from "bun:test";

const id = "00000000-0000-4000-8000-000000000001";

test("notification pages validate cursors and filters and preserve the workspace boundary", async () => {
  const getNotificationPage = mock(async () =>
    failure("NOT_FOUND", "Item not found or access denied."),
  );
  const app = createContextRoutes({ ...services, getNotificationPage });
  for (const query of ["after=invalid", "filter=invalid", "limit=0", "limit=21", "limit=1.5"]) {
    expect((await app.request(`/notifications/page?organizationId=org&${query}`)).status).toBe(400);
  }
  expect(getNotificationPage).not.toHaveBeenCalled();
  const response = await app.request(
    `/notifications/page?organizationId=org&after=${id}&filter=unread`,
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual(failure("NOT_FOUND", "Item not found or access denied."));
  expect(getNotificationPage).toHaveBeenCalledWith(expect.any(Headers), {
    organizationId: "org",
    after: id,
    filter: "unread",
    limit: 20,
  });
});

test("context routes reject invalid input without invoking services", async () => {
  const spies = {
    getMessagePage: mock(services.getMessagePage),
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
    getNotificationPage: mock(services.getNotificationPage),
    markRead: mock(services.markRead),
    markAllRead: mock(services.markAllRead),
  };
  const app = createContextRoutes(spies);
  for (const path of [
    "/message-links",
    "/message-people",
    "/related",
    "/message-target",
    "/activity",
    "/notifications",
    "/notifications/page",
  ]) {
    const response = await app.request(path);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(failure("INVALID_INPUT", "Invalid request input."));
  }
  for (const [method, path] of [
    ["POST", "/message-page"],
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
  const readAll = await app.request("/notifications/read-all", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  expect(readAll.status).toBe(400);
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

test("page context rejects oversized pages before authorization and returns no partial metadata on denial", async () => {
  const getMessagePage = mock(async () => failure("NOT_FOUND", "Item not found or access denied."));
  const app = createContextRoutes({ ...services, getMessagePage });
  const request = (messageIds: string[]) =>
    app.request("/message-page", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: "org", messageIds }),
    });
  expect((await request(Array.from({ length: 51 }, () => id))).status).toBe(400);
  expect(getMessagePage).not.toHaveBeenCalled();
  const response = await request([id]);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual(failure("NOT_FOUND", "Item not found or access denied."));
});
