import { invalidate, mount, unmount } from "../client-cache.ts";
import { call } from "../http.ts";
import { keys, type HintTarget, type QueryKey } from "../keys.ts";
import { typeTime } from "../pacing.ts";
import { typedPrefixes } from "../words.ts";
import type { World } from "../world.ts";
import { applyProjects, type Project } from "./tasks.ts";

/**
 * Work linked to messages (components/context/...): the "Link work" picker on a message, the
 * linked-work card's remove action, creating a task from a message, and the discussions and
 * history panels of linked work. Writes invalidate as invalidateMessageWork in
 * queries/context/mutations.ts does.
 */

export interface LinkableWork {
  id: string;
  title: string;
  /** The project itself for a project. */
  projectEntityId: string;
  kind: "task" | "project";
}

/** The project list the picker shows next to task results (projectsQueryOptions). */
export async function mountProjects(world: World) {
  const rows = await mount(keys.projects(world.organizationId), async () => {
    const projects = await call<Project[]>("tasks.projects");
    if (projects) applyProjects(world, projects);
    return projects;
  });
  return rows ?? [];
}

function searchKey(world: World, input: object): QueryKey {
  return [...keys.search(world.organizationId), JSON.stringify(input)];
}

/**
 * Opens the picker (link-message-work.tsx): it searches editable work of one kind as the person
 * types; each settled prefix is one search. Resolves the rows of the last search and a closer.
 */
export async function openLinkPicker(world: World, kind: "task" | "project", text: string) {
  const mounted: QueryKey[] = [];
  const search = async (query: string) => {
    const input = { query, kind, editable: true };
    const key = searchKey(world, input);
    mounted.push(key);
    const rows = await mount(key, () =>
      call<{ id: string; title: string; projectEntityId?: string | null }[]>(
        "context.search",
        input,
      ),
    );
    return (rows ?? []).map((row): LinkableWork => ({
      id: row.id,
      title: row.title,
      projectEntityId: row.projectEntityId ?? row.id,
      kind,
    }));
  };
  // The empty query shows recent work at once; the project list labels task rows.
  let [rows] = await Promise.all([
    search(""),
    kind === "task" ? mountProjects(world) : Promise.resolve([]),
  ]);
  let typed = "";
  for (const prefix of text ? typedPrefixes(text) : []) {
    await typeTime(prefix.slice(typed.length));
    typed = prefix;
    rows = await search(prefix);
  }
  const close = () => {
    for (const key of mounted) unmount(key);
    unmount(keys.projects(world.organizationId));
  };
  return { rows, close };
}

function workTargets(
  world: World,
  conversationId: string,
  work: LinkableWork,
): (QueryKey | HintTarget)[] {
  const org = world.organizationId;
  return [
    // The web matches pages that hold the message; this client keys pages by their ends.
    keys.messagePages(org, conversationId),
    ...[...new Set([work.id, work.projectEntityId])].map((id) => keys.related(org, id)),
    ...(work.kind === "task" ? [keys.activity(org, work.id)] : []),
    ...[keys.search(org), keys.searchPages(org)].map((prefix) => ({
      prefix,
      staleOnly: true as const,
    })),
  ];
}

export async function linkWork(
  world: World,
  conversationId: string,
  messageId: string,
  work: LinkableWork,
) {
  const result = await call("context.links.attach", { messageId, entityId: work.id });
  if (result) await invalidate(workTargets(world, conversationId, work), "mutation");
  return !!result;
}

export async function unlinkWork(
  world: World,
  conversationId: string,
  messageId: string,
  work: LinkableWork,
) {
  const result = await call("context.links.detach", { messageId, entityId: work.id });
  if (result) await invalidate(workTargets(world, conversationId, work), "mutation");
  return !!result;
}

/** Creates a task in a project with the message as its source. Resolves the task's work row. */
export async function createTaskFromMessage(
  world: World,
  conversationId: string,
  messageId: string,
  projectEntityId: string,
  title: string,
) {
  const task = await call<{ entityId: string; title: string }>("context.sourceTasks", {
    messageId,
    projectEntityId,
    title,
    requestId: crypto.randomUUID(),
  });
  if (!task) return null;
  const work: LinkableWork = { id: task.entityId, title, projectEntityId, kind: "task" };
  await invalidate(
    [
      keys.project(world.organizationId, projectEntityId),
      ...workTargets(world, conversationId, work),
    ],
    "mutation",
  );
  return work;
}

/**
 * A linked work card opens its discussions (work-discussions.tsx) and, for a task, its history
 * (task-context.tsx). Resolves the number of rows shown and a closer.
 */
export async function showLinkedWork(world: World, work: LinkableWork) {
  const org = world.organizationId;
  const [related, activity] = await Promise.all([
    mount(keys.related(org, work.id), () =>
      call<unknown[]>("context.related", { entityId: work.id }),
    ),
    work.kind === "task"
      ? mount(keys.activity(org, work.id), () =>
          call<unknown[]>("context.activity", { entityId: work.id }),
        )
      : Promise.resolve([]),
  ]);
  const close = () => {
    unmount(keys.related(org, work.id));
    if (work.kind === "task") unmount(keys.activity(org, work.id));
  };
  return { rows: (related?.length ?? 0) + (activity?.length ?? 0), close };
}

/**
 * One message's links and people. No web screen reads these routes yet (the page context
 * carries both); they stay a rare read so their queries get some traffic.
 */
export function messageDetails(messageId: string) {
  return Promise.all([
    call<unknown[]>("context.messageLinks", { messageId }),
    call<unknown[]>("context.messagePeople", { messageId }),
  ]);
}
