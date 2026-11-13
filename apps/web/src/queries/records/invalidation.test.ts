import { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { domainTargets, invalidateTargets } from "../targets";
import { invalidateRecordWrite } from "./invalidation";
import { expect, test } from "bun:test";

test("CRM writes refresh customer details, tasks, and related context only in their workspace", async () => {
  const client = new QueryClient();
  const affected = [
    queryKeys.crmList("workspace", "accounts", "", false),
    [...queryKeys.contacts("workspace"), "record", "person"],
    [...queryKeys.contactInteractions("workspace"), "person"],
    queryKeys.crmRecord("workspace", "deals", "deal"),
    queryKeys.crmActivity("workspace", "deal"),
    queryKeys.related("workspace", "person"),
    queryKeys.project("workspace", "project"),
  ];
  const foreign = [
    queryKeys.crmRecord("other", "deals", "deal"),
    queryKeys.contacts("other"),
    queryKeys.contactInteractions("other"),
  ];
  for (const key of [...affected, ...foreign]) client.setQueryData(key, []);
  try {
    await invalidateRecordWrite(client, "workspace");
    for (const key of affected) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of foreign) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  } finally {
    client.clear();
  }
});

test("task changes refresh derived CRM follow-ups without touching another workspace", async () => {
  const client = new QueryClient();
  const followUps = [...queryKeys.crm("workspace"), "follow-ups", "deal"];
  const foreign = [...queryKeys.crm("other"), "follow-ups", "deal"];
  client.setQueryData(followUps, { nextAction: { dueDate: "2026-11-13" } });
  client.setQueryData(foreign, { nextAction: null });
  try {
    await invalidateTargets(
      client,
      domainTargets("tasks", "workspace", undefined, undefined, {
        projectId: "project",
        taskIds: ["task"],
      }),
    );
    expect(client.getQueryState(followUps)?.isInvalidated).toBe(true);
    expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
  } finally {
    client.clear();
  }
});
