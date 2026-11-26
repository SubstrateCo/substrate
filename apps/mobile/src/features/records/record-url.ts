import type { RecordTarget } from "./types";

function webOrigin(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("The workspace web address is invalid.");
  return url.origin;
}

export function recordURL(organizationId: string, record: RecordTarget, webURL?: string) {
  const params = new URLSearchParams({ workspaceId: organizationId });
  let path: string;
  switch (record.kind) {
    case "account":
    case "deal":
      path = "crm";
      params.set("section", record.kind === "deal" ? "deals" : "accounts");
      params.set("recordId", record.id);
      break;
    case "contact":
    case "interaction":
      path = record.kind === "contact" ? "contacts" : "interactions";
      params.set("recordId", record.id);
      break;
    case "task":
    case "project":
      path = "tasks";
      if (record.kind === "task") {
        params.set("taskId", record.id);
        if (record.projectId) params.set("projectId", record.projectId);
      } else params.set("projectId", record.id);
      break;
  }
  const base = webURL ? `${webOrigin(webURL)}/` : "substrate-mobile://";
  return `${base}${path}?${params}`;
}

export function calendarRecordURL(organizationId: string, eventId: string, webURL?: string) {
  if (!webURL)
    throw new Error("Calendar opens on the web. No workspace web address is configured.");
  return `${webOrigin(webURL)}/calendar?${new URLSearchParams({ workspaceId: organizationId, eventId })}`;
}
