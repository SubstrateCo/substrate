import { parseRecordTarget } from "@/lib/navigation";

const identifier = /^[a-zA-Z0-9_-]{1,200}$/;

/** Authentication can resume an organization-aware native workspace destination, never a URL. */
export function workspaceContinuation(value: string): string | undefined {
  try {
    const url = new URL(value, "https://mobile.invalid");
    if (url.origin !== "https://mobile.invalid" || url.pathname !== "/" || url.hash)
      return undefined;
    const params = new URLSearchParams();
    for (const name of ["workspaceId", "conversationId", "messageId"]) {
      const field = url.searchParams.get(name);
      if (!field) continue;
      if (!identifier.test(field)) return undefined;
      params.set(name, field);
    }
    const tab = url.searchParams.get("tab");
    if (tab) {
      if (!["messages", "tasks", "crm"].includes(tab)) return undefined;
      params.set("tab", tab);
    }
    const record = url.searchParams.get("record");
    if (record) {
      const target = parseRecordTarget(record);
      if (!target) return undefined;
      params.set("record", JSON.stringify(target));
    }
    const needsScope = ["conversationId", "messageId", "record"].some((name) => params.has(name));
    if (needsScope && !params.has("workspaceId")) return undefined;
    return params.size ? `/?${params}` : "/";
  } catch {
    return undefined;
  }
}
