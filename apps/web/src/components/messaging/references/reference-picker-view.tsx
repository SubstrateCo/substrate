import type { AgentCallMode } from "@substrate/contracts/agents";
import { taskStatusLabels, type TaskStatus } from "@substrate/contracts/tasks";

import { useContext, useEffect, useId, useImperativeHandle, useRef, useState } from "react";

import { ErrorState } from "../../feedback/error-state";
import type { WorkspaceReference } from "./entity-reference";
import { ReferencePickerLink } from "./reference-picker-context";
import { ReferencePickerLoadingOption, ReferencePickerOption } from "./reference-picker-option";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ReferenceKind = "task" | "project" | "person" | "agent" | "channel" | "thread";
/** A picker tab: one kind, or "all" for a mixed list. */
export type ReferenceTab = ReferenceKind | "all";
const kindLabels: Record<ReferenceTab, string> = {
  all: "All",
  person: "People",
  agent: "Agents",
  task: "Tasks",
  project: "Projects",
  channel: "Channels",
  thread: "Threads",
};

function optionDescription(item: {
  conversationName?: string;
  projectName?: string;
  status?: TaskStatus;
  callMode?: AgentCallMode;
}) {
  if (item.callMode === "ask") return "Calls need the owner’s approval";
  if (item.callMode === "anyone") return "Available to call";
  if (item.conversationName) return `In ${item.conversationName}`;
  const parts = [item.projectName, item.status && taskStatusLabels[item.status]];
  return parts.filter(Boolean).join(" · ") || undefined;
}

/** Splits rows into runs of one kind, in the order the kinds first appear. */
function groupByKind<T extends { kind: ReferenceKind }>(rows: readonly T[]) {
  const groups: { kind: ReferenceKind; rows: T[] }[] = [];
  for (const row of rows) {
    const group = groups.find((item) => item.kind === row.kind);
    if (group) group.rows.push(row);
    else groups.push({ kind: row.kind, rows: [row] });
  }
  return groups;
}

export function ReferencePickerView({
  query,
  kind,
  kinds,
  results,
  loading = false,
  error,
  truncatedKinds = [],
  onKindChange,
  onRetry,
  onInsert,
}: {
  query: string;
  kind: ReferenceTab;
  kinds: readonly ReferenceTab[];
  results: {
    id: string;
    kind: ReferenceKind;
    title: string;
    image?: string | null;
    conversationName?: string;
    /** Tasks only: tells tasks with the same title apart. */
    projectName?: string;
    status?: TaskStatus;
    callMode?: AgentCallMode;
  }[];
  /** Nothing to show yet. Rows that still match stay visible while a search refreshes. */
  loading?: boolean;
  error?: Error | null;
  /** Kinds in "All" that may have more matches than shown. */
  truncatedKinds?: readonly ReferenceKind[];
  onKindChange: (kind: ReferenceTab) => void;
  onRetry?: () => void;
  onInsert: (token: string, reference: WorkspaceReference) => void;
}) {
  // The option the person moved to. Until they move, the best option is selected, so it follows
  // better results as they arrive. The owner keys this view by query, so a new query resets it.
  const [activeId, setActiveId] = useState<string>();
  const link = useContext(ReferencePickerLink);
  const ownListId = useId();
  const listId = link?.listId ?? ownListId;
  const list = useRef<HTMLDivElement>(null);
  const groups = groupByKind(error ? [] : results);
  const available = groups.flatMap((group) => group.rows);
  const optionId = (item: { id: string; kind: ReferenceKind }) =>
    `${listId}-${item.kind}-${item.id}`;
  const selectedIndex = Math.max(
    0,
    available.findIndex((item) => optionId(item) === activeId),
  );
  const selected = available.at(selectedIndex);
  const selectedId = selected ? optionId(selected) : undefined;
  const onActiveOptionChange = link?.onActiveOptionChange;
  // The selection also changes when results load or shrink, not only from keys.
  useEffect(() => {
    onActiveOptionChange?.(selectedId);
    return () => onActiveOptionChange?.(undefined);
  }, [selectedId, onActiveOptionChange]);
  // A query with spaces that matches nothing is probably prose, so the picker steps aside.
  const noMatches = !loading && !error && available.length === 0;
  const onDismiss = link?.onDismiss;
  useEffect(() => {
    if (noMatches && query.includes(" ")) onDismiss?.();
  }, [noMatches, query, onDismiss]);
  const insert = (item: (typeof results)[number]) =>
    onInsert(`@[${item.kind}:${item.id}]`, {
      id: item.id,
      kind: item.kind,
      label: item.title,
      status: item.status && { value: item.status, label: taskStatusLabels[item.status] },
    });
  const move = (delta: number) => {
    if (!available.length) return undefined;
    const next = available.at((selectedIndex + delta + available.length) % available.length)!;
    setActiveId(optionId(next));
    return next;
  };
  const changeKind = (next: ReferenceTab) => {
    setActiveId(undefined);
    onKindChange(next);
  };
  useImperativeHandle(link?.handle, () => ({
    move: (delta) => {
      move(delta);
    },
    choose: () => {
      if (selected) insert(selected);
      // While results load, Enter waits for them rather than sending the message.
      return !!selected || loading;
    },
    cycle: (delta) => {
      const index = kinds.indexOf(kind);
      changeKind(kinds[(index + delta + kinds.length) % kinds.length]!);
    },
  }));
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Keep the selected option in view after the selection renders.
  }, [selectedId, selectedIndex]);
  const renderOption = (item: (typeof results)[number]) => (
    <ReferencePickerOption
      id={optionId(item)}
      key={optionId(item)}
      kind={item.kind}
      title={item.title}
      image={item.image}
      status={item.status}
      description={optionDescription(item)}
      selected={item === selected}
      onFocus={() => setActiveId(optionId(item))}
      onSelect={() => insert(item)}
    />
  );
  return (
    <Tabs
      value={kind}
      onValueChange={(value) => {
        const next = kinds.find((kind) => kind === value);
        if (next) changeKind(next);
      }}
      asChild
    >
      <section
        aria-label="Insert workspace reference"
        className="flex max-h-96 min-h-0 flex-col gap-2 overflow-hidden p-2"
      >
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto">
          <TabsList aria-label="Reference type">
            {kinds.map((type) => (
              <TabsTrigger
                key={type}
                value={type}
                focusStyle={type === "channel" || type === "thread" ? "none" : "ring"}
              >
                {kindLabels[type]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {query && (
          <p className="shrink-0 truncate px-2 text-xs text-muted-foreground" title={query}>
            Results for “{query}”
          </p>
        )}
        {kinds.map((type) => (
          <TabsContent key={type} value={type} forceMount hidden={type !== kind} asChild>
            <div ref={type === kind ? list : undefined} className="min-h-8 flex-1 overflow-y-auto">
              {type === kind && (
                <>
                  {loading && (
                    <div role="status" aria-label="Searching references">
                      <ReferencePickerLoadingOption />
                      <ReferencePickerLoadingOption />
                      <ReferencePickerLoadingOption />
                    </div>
                  )}
                  {error && (
                    <ErrorState
                      variant="compact"
                      title="Couldn’t search references"
                      onRetry={onRetry}
                    />
                  )}
                  {noMatches && (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                      No accessible references found.
                    </p>
                  )}
                  <div
                    id={listId}
                    role="listbox"
                    aria-label="References"
                    onKeyDown={(event) => {
                      if (
                        event.nativeEvent.isComposing ||
                        !["ArrowDown", "ArrowUp"].includes(event.key)
                      )
                        return;
                      event.preventDefault();
                      const next = move(event.key === "ArrowDown" ? 1 : -1);
                      if (next) document.getElementById(optionId(next))?.focus();
                    }}
                  >
                    {kind === "all"
                      ? groups.map((group) => (
                          <div
                            key={group.kind}
                            role="group"
                            aria-labelledby={`${listId}-${group.kind}-heading`}
                          >
                            <div
                              id={`${listId}-${group.kind}-heading`}
                              aria-hidden="true"
                              className="flex items-baseline justify-between gap-2 px-2 pt-2 pb-1 text-xs text-muted-foreground"
                            >
                              <span className="font-medium">{kindLabels[group.kind]}</span>
                              {truncatedKinds.includes(group.kind) && <span>Top matches</span>}
                            </div>
                            {group.rows.map(renderOption)}
                          </div>
                        ))
                      : available.map(renderOption)}
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        ))}
        <Separator />
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <KbdGroup>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </KbdGroup>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd>
            Insert
          </span>
          {kinds.length > 1 && (
            <span className="flex items-center gap-1">
              <Kbd>Tab</Kbd>
              Filter
            </span>
          )}
          <span className="flex items-center gap-1">
            <Kbd>Esc</Kbd>
            Close
          </span>
        </div>
      </section>
    </Tabs>
  );
}
