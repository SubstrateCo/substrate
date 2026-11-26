import type { AgentCallMode } from "@substrate/contracts/agents";
import { taskStatusLabels, type TaskStatus } from "@substrate/contracts/tasks";

import { useContext, useEffect, useId, useImperativeHandle, useRef, useState } from "react";

import { ErrorState } from "../../feedback/error-state";
import type { WorkspaceReference } from "./entity-reference";
import { ReferencePickerLink } from "./reference-picker-context";
import { ReferencePickerLoadingOption, ReferencePickerOption } from "./reference-picker-option";
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

export function ReferencePickerView({
  query,
  kind,
  kinds,
  results,
  loading = false,
  error,
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
  loading?: boolean;
  error?: Error | null;
  onKindChange: (kind: ReferenceTab) => void;
  onRetry?: () => void;
  onInsert: (token: string, reference: WorkspaceReference) => void;
}) {
  // The owner keys this view by query, so a new query starts at the first option.
  const [index, setIndex] = useState(0);
  const link = useContext(ReferencePickerLink);
  const ownListId = useId();
  const listId = link?.listId ?? ownListId;
  const list = useRef<HTMLDivElement>(null);
  const available = loading || error ? [] : results;
  const selectedIndex = Math.min(index, Math.max(0, available.length - 1));
  const optionId = (item: { id: string; kind: ReferenceKind }) =>
    `${listId}-${item.kind}-${item.id}`;
  const selected = available.at(selectedIndex);
  const selectedId = selected ? optionId(selected) : undefined;
  const onActiveOptionChange = link?.onActiveOptionChange;
  // The selection also changes when results load or shrink, not only from keys.
  useEffect(() => {
    onActiveOptionChange?.(selectedId);
    return () => onActiveOptionChange?.(undefined);
  }, [selectedId, onActiveOptionChange]);
  const insert = (item: (typeof results)[number]) =>
    onInsert(`@[${item.kind}:${item.id}]`, {
      id: item.id,
      kind: item.kind,
      label: item.title,
      status: item.status && { value: item.status, label: taskStatusLabels[item.status] },
    });
  const move = (delta: number) => {
    const next = Math.max(0, Math.min(available.length - 1, selectedIndex + delta));
    setIndex(next);
    return available.at(next);
  };
  useImperativeHandle(link?.handle, () => ({
    move: (delta) => {
      move(delta);
    },
    choose: () => {
      if (selected) insert(selected);
    },
  }));
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Keep the selected option in view after the selection renders.
  }, [selectedId, selectedIndex]);
  return (
    <Tabs
      value={kind}
      onValueChange={(value) => {
        const next = kinds.find((kind) => kind === value);
        if (!next) return;
        setIndex(0);
        onKindChange(next);
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
                    </div>
                  )}
                  {error && (
                    <ErrorState compact title="Couldn’t search references" onRetry={onRetry} />
                  )}
                  {!loading && !error && results.length === 0 && (
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
                    {available.map((item, itemIndex) => (
                      <ReferencePickerOption
                        id={optionId(item)}
                        key={optionId(item)}
                        kind={item.kind}
                        title={item.title}
                        image={item.image}
                        status={item.status}
                        description={optionDescription(item)}
                        selected={selectedIndex === itemIndex}
                        onFocus={() => setIndex(itemIndex)}
                        onSelect={() => insert(item)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        ))}
      </section>
    </Tabs>
  );
}
