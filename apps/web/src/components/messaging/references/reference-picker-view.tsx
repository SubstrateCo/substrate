import type { AgentCallMode } from "@substrate/contracts/agents";
import { taskStatusLabels, type TaskStatus } from "@substrate/contracts/tasks";

import { useContext, useEffect, useId, useRef, useState } from "react";

import { ErrorState } from "../../feedback/error-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import type { WorkspaceReference } from "./entity-reference";
import { ReferencePickerAccessibility } from "./reference-picker-context";
import { ReferencePickerLoadingOption, ReferencePickerOption } from "./reference-picker-option";

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
  onClose,
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
  onClose: () => void;
}) {
  const [selection, setSelection] = useState({ query, kind, index: 0 });
  const index = selection.query === query && selection.kind === kind ? selection.index : 0;
  if (selection.query !== query || selection.kind !== kind) setSelection({ query, kind, index: 0 });
  const setIndex = (index: number) => setSelection({ query, kind, index });
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const available = loading || error ? [] : results;
  const selectedIndex = Math.min(index, Math.max(0, available.length - 1));
  const optionId = (item: { id: string; kind: ReferenceKind }) =>
    `${listId}-${item.kind}-${item.id}`;
  const selected = available.at(selectedIndex);
  const selectedId = selected ? optionId(selected) : undefined;
  const setAccessibility = useContext(ReferencePickerAccessibility);
  useEffect(() => {
    setAccessibility?.({ listId, selectedId });
    return () => setAccessibility?.(null);
  }, [listId, selectedId, setAccessibility]);
  const insert = (item: (typeof results)[number]) =>
    onInsert(`@[${item.kind}:${item.id}]`, {
      id: item.id,
      kind: item.kind,
      label: item.title,
      status: item.status && { value: item.status, label: taskStatusLabels[item.status] },
    });
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedId, selectedIndex]);
  return (
    <Tabs
      value={kind}
      onValueChange={(value) => {
        const next = kinds.find((kind) => kind === value);
        if (next) onKindChange(next);
      }}
      asChild
    >
      <section
        data-reference-picker=""
        aria-label="Insert workspace reference"
        className="flex max-h-96 min-h-0 flex-col gap-2 overflow-hidden p-2"
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.target !== e.currentTarget) return;
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex(Math.min(selectedIndex + 1, Math.max(0, available.length - 1)));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex(Math.max(0, selectedIndex - 1));
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (selected) insert(selected);
          }
        }}
      >
        <div className="flex shrink-0 items-center gap-1">
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
        {query && <p className="px-2 text-xs text-muted-foreground">Results for “{query}”</p>}
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
                      const next = Math.max(
                        0,
                        Math.min(
                          available.length - 1,
                          selectedIndex + (event.key === "ArrowDown" ? 1 : -1),
                        ),
                      );
                      setIndex(next);
                      if (available.length)
                        document.getElementById(optionId(available[next]!))?.focus();
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
