import type { RecordTarget } from "./navigation";
import { authRouteFromUrl } from "@/features/auth/navigation";
import { crmSection } from "@/features/records/crm/crm-navigation";

const identifier = /^[a-zA-Z0-9_-]{1,200}$/;

function field(url: URL, name: string) {
  const value = url.searchParams.get(name);
  return value && identifier.test(value) ? value : undefined;
}

export function mobileRouteFromUrl(value: string, trustedWebOrigin?: string): string | null {
  const authRoute = authRouteFromUrl(value, trustedWebOrigin);
  if (authRoute) return authRoute;
  if (value.includes("\\") || value.length > 8192) return null;
  try {
    const local = value.startsWith("/") && !value.startsWith("//");
    const url = new URL(value, "https://mobile.invalid");
    if (url.username || url.password) return null;
    const native = url.protocol === "substrate-mobile:";
    const trusted = trustedWebOrigin && url.origin === new URL(trustedWebOrigin).origin;
    if (!local && !native && !trusted) return null;
    const path = native ? `/${url.hostname}${url.pathname}` : url.pathname;
    const workspaceId = field(url, "workspaceId");
    if (!workspaceId) return null;
    const params = new URLSearchParams({ workspaceId });
    let record: RecordTarget | undefined;
    switch (path) {
      case "/messages": {
        const conversationId = field(url, "conversationId");
        if (!conversationId) return null;
        params.set("tab", "messages");
        params.set("conversationId", conversationId);
        const messageId = field(url, "messageId");
        if (messageId) params.set("messageId", messageId);
        break;
      }
      case "/tasks": {
        params.set("tab", "tasks");
        const projectId = field(url, "projectId");
        const taskId = field(url, "taskId");
        if (taskId) record = { kind: "task", id: taskId, projectId };
        else if (projectId) record = { kind: "project", id: projectId };
        break;
      }
      case "/contacts": {
        params.set("tab", "crm");
        params.set("crmSection", "contacts");
        const id = field(url, "recordId");
        if (id) record = { kind: "contact", id };
        break;
      }
      case "/interactions": {
        params.set("tab", "crm");
        params.set("crmSection", "interactions");
        const section = url.searchParams.get("section");
        if (section === "activity" || section === "people" || section === "accounts")
          params.set("interactionView", section);
        const id = field(url, "recordId");
        const profileId = field(url, "profileId");
        if (id) record = { kind: "interaction", id };
        else if (profileId)
          record = {
            kind: url.searchParams.get("section") === "account" ? "account" : "contact",
            id: profileId,
          };
        break;
      }
      case "/crm": {
        params.set("tab", "crm");
        params.set("crmSection", crmSection(url.searchParams.get("section")));
        const id = field(url, "recordId");
        if (id) {
          record = { kind: url.searchParams.get("section") === "deals" ? "deal" : "account", id };
        }
        break;
      }
      default:
        return null;
    }
    if (record) params.set("record", JSON.stringify(record));
    return `/?${params}`;
  } catch {
    return null;
  }
}
