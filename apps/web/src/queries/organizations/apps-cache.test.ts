import { QueryClient } from "@tanstack/react-query";

import { clearAppData } from "./apps-cache";
import { queryKeys } from "@/queries/keys";
import { expect, test } from "bun:test";

test("app changes discard records, task discussions, and cross-app previews without clearing another workspace", async () => {
  const client = new QueryClient();
  const removed = [
    [...queryKeys.tasks("org"), "project", "private"],
    [...queryKeys.crm("org"), "account", "private"],
    [...queryKeys.contacts("org"), "contact", "affiliations"],
    [...queryKeys.context("org"), "search", "private"],
    [...queryKeys.messaging("org"), "task-discussion"],
    queryKeys.calendarEvent("org", "meeting"),
    [...queryKeys.mail("user", "org"), "body", "message"],
  ];
  const retained = [
    queryKeys.calendar("other"),
    queryKeys.tasks("other"),
    queryKeys.crm("other"),
    queryKeys.context("other"),
    queryKeys.messaging("other"),
    queryKeys.organizationApps("org"),
    queryKeys.organizationSummary("org"),
    queryKeys.mail("user", "other"),
  ];
  for (const key of [...removed, ...retained]) client.setQueryData(key, { title: "Private data" });
  try {
    await clearAppData(client, "org", "user");
    for (const key of removed) expect(client.getQueryData(key)).toBeUndefined();
    for (const key of retained) expect(client.getQueryData(key)).toEqual({ title: "Private data" });
  } finally {
    client.clear();
  }
});
