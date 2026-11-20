import { failure, publicFailure } from "@substrate/contracts/result";

import {
  createTestScopes,
  createTestServices,
  createUnreachableServices,
} from "../../test-support";
import { createContextRoutes as createRoutes } from "./routes";
import type { ContextService } from "./service";
import { expect, mock, test } from "bun:test";

const services = createTestServices().context;
const createContextRoutes = (service: ContextService) => createRoutes(service, createTestScopes());

const id = "00000000-0000-4000-8000-000000000001";

test("group pages reject a malformed position and preserve their scoped paging input", async () => {
  const getNotificationGroups = mock(async () =>
    failure("NOT_FOUND", "Item not found or access denied."),
  );
  const app = createContextRoutes({ ...services, getNotificationGroups });
  const malformed = new URLSearchParams({ organizationId: "org", after: id });
  expect((await app.request(`/notifications/groups?${malformed}`)).status).toBe(400);
  expect(getNotificationGroups).not.toHaveBeenCalled();
  const after = JSON.stringify({ at: "2026-11-10T10:00:00.000001Z", id });
  const query = new URLSearchParams({
    organizationId: "org",
    filter: "unread",
    after,
    limit: "10",
  });
  expect((await app.request(`/notifications/groups?${query}`)).status).toBe(404);
  expect(getNotificationGroups).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "user-1", organizationId: "org" }),
    {
      organizationId: "org",
      filter: "unread",
      after,
      limit: 10,
    },
  );
});

test("notification pages reject invalid paging and preserve the workspace boundary", async () => {
  const getNotificationPage = mock(async () =>
    failure("NOT_FOUND", "Item not found or access denied."),
  );
  const app = createContextRoutes({ ...services, getNotificationPage });
  expect((await app.request("/notifications/page?organizationId=org&limit=21")).status).toBe(400);
  expect(getNotificationPage).not.toHaveBeenCalled();
  const response = await app.request(
    `/notifications/page?organizationId=org&after=${id}&filter=unread`,
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual(failure("NOT_FOUND", "Item not found or access denied."));
  expect(getNotificationPage).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "user-1", organizationId: "org" }),
    {
      organizationId: "org",
      after: id,
      filter: "unread",
      limit: 20,
    },
  );
});

test("context routes reject invalid input without invoking services", async () => {
  const app = createContextRoutes(createUnreachableServices<ContextService>());
  for (const path of [
    "/message-links",
    "/message-people",
    "/related",
    "/message-target",
    "/activity",
    "/notifications",
    "/notifications/page",
    "/notifications/groups",
    "/notifications/events",
    "/notifications/unread",
  ]) {
    const response = await app.request(path);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(publicFailure("INVALID_INPUT", "Invalid request input."));
  }
  for (const [method, path] of [
    ["POST", "/message-page"],
    ["POST", "/message-targets"],
    ["POST", "/search"],
    ["POST", "/source-tasks"],
    ["POST", "/links"],
    ["DELETE", "/links"],
    ["POST", "/notifications/read"],
    ["POST", "/notifications/read-group"],
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
  expect(searchContext).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "user-1", organizationId: "org" }),
    input,
    expect.any(AbortSignal),
  );
});

test("search forwards request cancellation and does not report it as a server error", async () => {
  const controller = new AbortController();
  let searchSignal: AbortSignal | undefined;
  const searchContext: ContextService["searchContext"] = async (_scope, _input, signal) => {
    searchSignal = signal;
    controller.abort();
    signal?.throwIfAborted();
    return { success: true, data: [] };
  };
  const app = createContextRoutes({ ...services, searchContext });
  const response = await app.request("/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ organizationId: "org", query: "Launch" }),
    signal: controller.signal,
  });
  expect(searchSignal?.aborted).toBe(true);
  expect(response.status).toBe(499);
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
  expect(detachWork).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "user-1", organizationId: "org" }),
    input,
  );
});

test("message targets reject oversized batches and forward the scoped targets", async () => {
  const getMessageTargets = mock(async () => ({ success: true as const, data: [] }));
  const app = createContextRoutes({ ...services, getMessageTargets });
  const request = (targets: { conversationId?: string; messageId: string }[]) =>
    app.request("/message-targets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: "org", targets }),
    });
  const target = { conversationId: id, messageId: id };
  expect((await request(Array.from({ length: 51 }, () => target))).status).toBe(400);
  expect(getMessageTargets).not.toHaveBeenCalled();
  const response = await request([target]);
  expect(response.status).toBe(200);
  expect(getMessageTargets).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "user-1", organizationId: "org" }),
    { organizationId: "org", targets: [target] },
  );
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
