import { config } from "./config.ts";
import { trace } from "./debug.ts";
import { keys, type HintTarget, type QueryKey } from "./keys.ts";
import { refetches } from "./metrics.ts";

/**
 * A small model of the web client's TanStack Query cache (apps/web/src/router.tsx and
 * queries/realtime/cache.ts):
 * - Screens mount queries. Mounting a fresh query (fetched < staleTime ago, default 30 s, and not
 *   invalidated) reads nothing; otherwise it fetches.
 * - An invalidation refetches mounted matches and only marks unmounted ones stale.
 * - Unmounted data stays cached for 5 minutes (gcTime).
 * Each query belongs to the screen (view) that mounted it, or to the always-mounted frame.
 */

export type View = "messages" | "tasks" | "notifications" | "agents" | "settings";
type Owner = View | "frame";
export type RefetchCause = "mount" | "hint" | "ready" | "reconcile" | "mutation";

/** Fetches the query. `refetch` is true when data is already cached. Resolves null on failure. */
export type Fetcher<T> = (refetch: boolean) => Promise<T | null>;

interface Entry {
  key: QueryKey;
  id: string;
  fetcher: Fetcher<unknown>;
  data?: unknown;
  fetchedAt: number;
  invalid: boolean;
  staleTime: number;
  owners: Set<Owner>;
  unmountedAt: number;
  inflight?: Promise<void>;
  again: boolean;
  /** The clock value when the latest fetch started. */
  startedTick: number;
}

const gcTime = 5 * 60_000;
const entries = new Map<string, Entry>();
let view: View = "messages";
// Orders fetch starts and hint receipt, like the web cache's clock.
let clock = 0;

/** Marks the receipt of a hint. A fetch that starts later already reads its change. */
export function tick() {
  return ++clock;
}

const idOf = (key: QueryKey) => key.join("\u0000");
const matches = (key: QueryKey, prefix: QueryKey) =>
  prefix.length <= key.length && prefix.every((part, index) => key[index] === part);

function run(entry: Entry, cause: RefetchCause): Promise<void> {
  if (entry.inflight) {
    // Like cancelRefetch: false, the running read finishes and a second one follows.
    if (cause !== "mount") entry.again = true;
    return entry.inflight;
  }
  entry.inflight = (async () => {
    do {
      entry.again = false;
      entry.invalid = false;
      entry.startedTick = ++clock;
      const startedAt = Date.now();
      refetches.add(1, { cause });
      trace("fetch", `${cause} ${entry.key.slice(2).join("/")}`);
      try {
        const data = await entry.fetcher(entry.data !== undefined);
        if (data !== null) {
          entry.data = data;
          entry.fetchedAt = startedAt;
        }
      } catch (error) {
        console.error(`[vu ${__VU}] query ${entry.key.join("/")} threw: ${String(error)}`);
      }
      // A hint can set again while the fetcher is awaited.
    } while (needsAnotherFetch(entry));
  })().finally(() => {
    entry.inflight = undefined;
  });
  return entry.inflight;
}

function needsAnotherFetch(entry: Entry) {
  return entry.again && entry.owners.size > 0;
}

function collectGarbage() {
  const now = Date.now();
  for (const [id, entry] of entries)
    if (!entry.owners.size && !entry.inflight && now - entry.unmountedAt > gcTime)
      entries.delete(id);
}

/**
 * Mounts a query for the current view (or the frame) and resolves its data: cached when fresh,
 * fetched otherwise. Mount the same key again to keep it mounted with a newer fetcher.
 */
export async function mount<T>(
  key: QueryKey,
  fetcher: Fetcher<T>,
  options: { staleTime?: number; frame?: true } = {},
): Promise<T | undefined> {
  collectGarbage();
  const id = idOf(key);
  let entry = entries.get(id);
  if (!entry) {
    entry = {
      key,
      id,
      fetcher,
      fetchedAt: 0,
      invalid: false,
      staleTime: 30_000,
      owners: new Set(),
      unmountedAt: 0,
      again: false,
      startedTick: 0,
    };
    entries.set(id, entry);
  }
  entry.fetcher = fetcher;
  entry.staleTime = options.staleTime ?? 30_000;
  entry.owners.add(options.frame ? "frame" : view);
  const fresh =
    entry.data !== undefined && !entry.invalid && Date.now() - entry.fetchedAt < entry.staleTime;
  if (!fresh || entry.inflight) await run(entry, "mount");
  // SAFETY: callers pair a query key with one response type, as in the renderer cache.
  return entry.data as T | undefined;
}

/** Unmounts the current view's queries under `prefix`, as when a pane or dialog closes. */
export function unmount(prefix: QueryKey) {
  for (const entry of entries.values())
    if (matches(entry.key, prefix) && entry.owners.delete(view) && !entry.owners.size)
      entry.unmountedAt = Date.now();
}

/** Drains detached reads before a structural write; k6 cannot abort an HTTP read on unmount. */
export async function settleInactive(prefixes: QueryKey[]) {
  await Promise.all(
    [...entries.values()].flatMap((entry) =>
      !entry.owners.size && prefixes.some((prefix) => matches(entry.key, prefix))
        ? (entry.inflight ?? [])
        : [],
    ),
  );
}

/** Drops detached query data after its resource is removed, like QueryClient.removeQueries. */
export function removeInactive(prefixes: QueryKey[]) {
  for (const [id, entry] of entries)
    if (
      !entry.owners.size &&
      !entry.inflight &&
      prefixes.some((prefix) => matches(entry.key, prefix))
    )
      entries.delete(id);
}

/** Switches the main screen: the old view's queries unmount; frame queries stay. */
export function navigate(next: View) {
  if (next === view) return;
  trace("view", `${view} -> ${next}`);
  unmount([]);
  view = next;
  visits++;
}

// Counts screen switches and sign-ins, so a screen's <img> elements load again when it remounts.
let visits = 0;
export function visit() {
  return visits;
}

export function currentView() {
  return view;
}

/** The cached data of a key, mounted or not. */
export function cached<T>(key: QueryKey): T | undefined {
  // SAFETY: callers use the same response type as the fetcher registered for this key.
  return entries.get(idOf(key))?.data as T | undefined;
}

function linked(entry: Entry) {
  // SAFETY: withLinks targets message context pages, whose cached rows carry links arrays.
  const rows = entry.data as { links?: unknown[] }[] | undefined;
  return rows === undefined || rows.some((row) => (row.links?.length ?? 0) > 0);
}

/** targets.ts linksWork: a context page that links one of these tasks or projects. */
function linksWork(entry: Entry, ids: string[]) {
  // SAFETY: linksTo targets message context pages, whose links identify tasks and projects.
  const rows = entry.data as
    | { links?: { entityId?: string; projectEntityId?: string }[] }[]
    | undefined;
  return (
    rows === undefined ||
    rows.some((row) =>
      (row.links ?? []).some(
        (link) =>
          (!!link.entityId && ids.includes(link.entityId)) ||
          (!!link.projectEntityId && ids.includes(link.projectEntityId)),
      ),
    )
  );
}

/** targets.ts showsConversation: a related list with a message of this conversation. */
function showsConversation(entry: Entry, conversationId: string) {
  // SAFETY: inConversation targets related lists, whose rows include conversationId.
  const rows = entry.data as { conversationId?: string }[] | undefined;
  return rows === undefined || rows.some((row) => row.conversationId === conversationId);
}

/** targets.ts queryTargetFilter: the data and key conditions of a hint target. */
function selects(entry: Entry, target: HintTarget) {
  const { prefix, withLinks, withMessage, inConversation, withId, linksTo } = target;
  return (
    matches(entry.key, prefix) &&
    (!withLinks || linked(entry)) &&
    (!withMessage || keys.messagePageIds(entry.key).includes(withMessage)) &&
    (!inConversation || showsConversation(entry, inConversation)) &&
    (!withId || entry.key.slice(prefix.length).includes(withId)) &&
    (!linksTo || linksWork(entry, linksTo))
  );
}

/**
 * Marks matching queries stale and refetches the mounted ones. Mutations pass their prefixes;
 * realtime passes hint targets and `since`, the tick of the batch's last hint: queries whose
 * fetch started after it are skipped. Backfill only marks: it reads nothing it does not need.
 */
export async function invalidate(
  targets: (QueryKey | HintTarget)[],
  cause: RefetchCause,
  since?: number,
) {
  const reads: Promise<void>[] = [];
  for (const target of targets) {
    const hint: HintTarget = "prefix" in target ? target : { prefix: target };
    const { staleOnly } = hint;
    for (const entry of entries.values()) {
      if (!selects(entry, hint)) continue;
      if (since !== undefined && entry.startedTick > since) continue;
      entry.invalid = true;
      if (entry.owners.size && !staleOnly && config.realtime) reads.push(run(entry, cause));
    }
  }
  await Promise.all(reads);
}

/** Refetches every mounted query, as on `ready` and on the 30 s reconcile. */
export function refreshAll(cause: RefetchCause) {
  return invalidate([[]], cause);
}

/** Drops unmounted private data, as the client does before reconcile and on resync. */
export function discardInactive() {
  for (const [id, entry] of entries)
    if (
      !entry.owners.size &&
      !entry.inflight &&
      (entry.key[0] === "organizations" || entry.key[0] === "users")
    )
      entries.delete(id);
}

/** Unmounts everything and waits for running reads, so none reaches the server signed out. */
export async function settleCache() {
  for (const entry of entries.values()) entry.owners.clear();
  for (;;) {
    const running = [...entries.values()].flatMap((entry) => entry.inflight ?? []);
    if (!running.length) return;
    await Promise.all(running);
  }
}

/** Clears everything on sign-out. */
export function resetCache() {
  entries.clear();
  view = "messages";
  visits++;
}
