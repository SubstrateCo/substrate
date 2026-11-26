import type { ReferenceKind, ReferenceTab } from "@substrate/contracts/messaging/references";

import { useQueryClient } from "@tanstack/react-query";

import { useEffect } from "react";

import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { searchOptions, type SearchInput } from "@/queries/context/search";

// "All" lists the best few of each kind.
export const mixedLimit = 5;
export type MixedKind = Extract<ReferenceKind, "person" | "agent" | "task" | "project">;

export function mixedKinds(tasks: boolean): MixedKind[] {
  return tasks ? ["person", "agent", "task", "project"] : ["person", "agent"];
}

// People, agents and work are searched as a batch, even for one tab, so the server ranks the best
// matches first. Channels and threads keep their own order.
export function referenceSearchInput(
  scope: { organizationId: string; conversationId: string; query: string },
  kind: ReferenceTab,
  tasks: boolean,
): SearchInput {
  if (kind === "all") return { ...scope, kinds: mixedKinds(tasks), limit: mixedLimit };
  if (kind === "channel" || kind === "thread") return { ...scope, kind };
  return { ...scope, kinds: [kind] };
}

/** Loads the suggestions an "@" shows, so the picker opens with results. */
export function usePrefetchReferences(conversationId: string) {
  const { organizationId } = useWorkspaceScope();
  const apps = useOrganizationApps();
  const tasks = apps.enabled("tasks");
  const client = useQueryClient();
  useEffect(() => {
    if (!apps.ready) return;
    const input = referenceSearchInput({ organizationId, conversationId, query: "" }, "all", tasks);
    client.query(searchOptions(input)).catch(() => {});
  }, [apps.ready, client, conversationId, organizationId, tasks]);
}
