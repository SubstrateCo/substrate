import { mount, unmount } from "../client-cache.ts";
import { trace } from "../debug.ts";
import { call } from "../http.ts";
import { keys } from "../keys.ts";
import type { World } from "../world.ts";
import { Rate } from "k6/metrics";

export type SearchKind = "all" | "message" | "task" | "project" | "channel";
export interface SearchResult {
  id: string;
  kind: string;
  title: string;
  excerpt?: string;
  conversationId?: string;
  projectEntityId?: string;
  membership?: "joined" | "left" | "none";
}

const hits = new Rate("search_with_hits");

/** Workspace search is an overlay: its queries belong to the current underlying screen. */
export async function searchPage(world: World, query: string, kind: SearchKind, after?: string) {
  const input = { query, kind };
  const prefix = keys.searchPages(world.organizationId);
  // Only the settled input is observed; superseded prefix results are no longer mounted.
  if (!after) unmount(prefix);
  const rows =
    (await mount([...prefix, JSON.stringify(input), after ?? "latest"], async () => {
      const page = await call<SearchResult[]>("context.search", { ...input, after, limit: 30 });
      if (page) {
        hits.add(page.length > 0);
        trace(
          "search",
          `${kind} ${JSON.stringify(query)}${after ? " next page" : ""}: ${page.length} hits`,
        );
        for (const row of page) {
          if (row.kind !== "project" && row.kind !== "task") continue;
          const known = row.kind === "project" ? world.projects : world.tasks;
          if (!known.some((item) => item.entityId === row.id))
            known.push({
              entityId: row.id,
              title: row.title,
              projectEntityId: row.kind === "task" ? row.projectEntityId : undefined,
            });
        }
      }
      return page;
    })) ?? [];
  return rows;
}

export function closeSearch(world: World) {
  unmount(keys.searchPages(world.organizationId));
}
