import { useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@startup-os/ui/primitives/button";
import {
  ReferenceEditor,
  type ReferenceEditorHandle,
} from "@startup-os/ui/messaging/reference-editor";
import { MessageMarkdown } from "@startup-os/ui/messaging/message-markdown";
import {
  ReferencePopover,
  referenceOptionId,
  type ReferenceSuggestion,
} from "@startup-os/ui/messaging/reference-popover";
import { referencePrefix, referenceQuery } from "@startup-os/ui/messaging/reference-query";
import { referenceFixtures } from "./reference-fixtures";

const suggestions: ReferenceSuggestion[] = referenceFixtures.map((item) => ({
  id: item.id,
  kind: item.kind,
  title: item.label,
  description: {
    person: "Member · #general",
    task: "Workspace launch · In progress",
    project: "Project · Launch planning",
  }[item.kind],
}));
// These are review fixtures, not a client-side source of authorization or recency.
const orderedSuggestions = [
  suggestions[3]!,
  suggestions[0]!,
  suggestions[2]!,
  suggestions[4]!,
  suggestions[1]!,
];

export function ReferenceComposerScene({
  initialDraft = "Can you take a look at @",
  state = "ready",
  longNames = false,
  narrow = false,
}: {
  initialDraft?: string;
  state?: "ready" | "loading" | "error" | "empty" | "refresh-error";
  longNames?: boolean;
  narrow?: boolean;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [caret, setCaret] = useState(initialDraft.length);
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);
  const [retried, setRetried] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [focusTarget, setFocusTarget] = useState<{ caret: number } | null>(null);
  const editor = useRef<ReferenceEditorHandle>(null);
  const listId = useId();
  const hintId = useId();
  const active = referenceQuery(draft, caret);
  const open = !!active && !dismissed;
  const loading = state === "loading";
  const failed = !retried && (state === "error" || state === "refresh-error");
  const results =
    loading || state === "empty" || (failed && state === "error")
      ? []
      : orderedSuggestions.flatMap((item) => {
          const result = longNames
            ? {
                ...item,
                title: `${item.title} — workspace launch readiness and cross-team review for the November release`,
              }
            : item;
          const matches =
            (!active || active.kind === "all" || item.kind === active.kind) &&
            result.title.toLowerCase().includes(active?.query.toLowerCase() ?? "");
          return matches ? [result] : [];
        });
  const selectedIndex = Math.min(index, Math.max(0, results.length - 1));
  const previewReferences = longNames
    ? referenceFixtures.map((item) => ({
        ...item,
        label: `${item.label} — workspace launch readiness and cross-team review for the November release`,
      }))
    : referenceFixtures;

  useLayoutEffect(() => {
    if (!focusTarget) return;
    editor.current?.focusAt(focusTarget.caret);
  }, [focusTarget]);

  const replaceQuery = (text: string) => {
    const start = active?.start ?? caret;
    const end = active?.end ?? caret;
    const nextCaret = start + text.length;
    setDraft(draft.slice(0, start) + text + draft.slice(end));
    setCaret(nextCaret);
    setFocusTarget({ caret: nextCaret });
    setIndex(0);
    setDismissed(false);
  };
  const select = (item: ReferenceSuggestion) => {
    const space = /\s/.test(draft[active?.end ?? caret] ?? "") ? "" : " ";
    replaceQuery(`@[${item.kind}:${item.id}]${space}`);
    setDismissed(true);
  };
  const send = () => {
    if (!draft.trim()) return;
    setSent([...sent, draft.trim()]);
    setDraft("");
    setCaret(0);
    setDismissed(true);
    setFocusTarget({ caret: 0 });
  };

  return (
    <main className="flex min-h-dvh items-end justify-center bg-muted/30 p-3 sm:items-center sm:p-8">
      <section
        aria-label="Reference composer preview"
        className={`flex min-h-160 w-full min-w-0 flex-col overflow-hidden rounded-xl border bg-background shadow-raised ${narrow ? "max-w-sm" : "max-w-3xl"}`}
      >
        <header className="border-b px-5 py-4">
          <h1 className="text-sm font-semibold"># general</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Reference picker · interactive design preview
          </p>
        </header>
        <div className="flex-1 space-y-6 px-5 py-6">
          <article aria-label="Message from Alex Morgan" className="flex gap-3">
            <div
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground"
            >
              AM
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                Alex Morgan{" "}
                <span className="ml-2 text-xs font-normal text-muted-foreground">10:42 AM</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The onboarding flow is ready for review. Link the task and project here so we can
                keep everything together.
              </p>
            </div>
          </article>
          {sent.map((body, i) => (
            <article
              key={i}
              aria-label="Sent message"
              className="min-w-0 rounded-lg bg-muted/30 p-3"
            >
              <p className="text-sm font-semibold">You</p>
              <MessageMarkdown body={body} references={previewReferences} />
            </article>
          ))}
        </div>
        <div className="p-3 sm:p-4">
          <ReferencePopover
            open={open}
            onOpenChange={(value) => setDismissed(!value)}
            listId={listId}
            kind={active?.kind ?? "all"}
            query={active?.query ?? ""}
            results={results}
            selectedIndex={selectedIndex}
            onHighlight={setIndex}
            onKindChange={(kind) => replaceQuery(referencePrefix(kind) + (active?.query ?? ""))}
            onSelect={select}
            loading={loading}
            error={failed ? new Error("Preview search failure") : null}
            onRetry={() => {
              setRetried(true);
              setFocusTarget({ caret });
            }}
          >
            <div className="rounded-xl border bg-card shadow-raised focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/15">
              <ReferenceEditor
                ref={editor}
                label="Message #general"
                descriptionId={hintId}
                listId={open ? listId : undefined}
                activeDescendant={
                  open && results[selectedIndex]
                    ? referenceOptionId(listId, results[selectedIndex]!)
                    : undefined
                }
                value={draft}
                references={previewReferences}
                onChange={(value, position) => {
                  setDraft(value);
                  setCaret(position);
                  setDismissed(false);
                  setIndex(0);
                }}
                onSelectionChange={(position) => {
                  if (position !== caret) {
                    setCaret(position);
                    setDismissed(false);
                    setIndex(0);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.isComposing || (event.key === "Enter" && event.shiftKey)) return;
                  if (open && ["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.key === "Escape") setDismissed(true);
                    if (event.key === "ArrowDown")
                      setIndex(Math.min(selectedIndex + 1, Math.max(0, results.length - 1)));
                    if (event.key === "ArrowUp") setIndex(Math.max(0, selectedIndex - 1));
                    if (event.key === "Enter" && !event.shiftKey && results[selectedIndex])
                      select(results[selectedIndex]!);
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
              <div className="flex items-center justify-between gap-2 px-3 pb-2">
                <p id={hintId} className="text-xs text-muted-foreground">
                  Type @ to reference
                </p>
                <Button type="button" size="sm" disabled={!draft.trim()} onClick={send}>
                  Send
                </Button>
              </div>
            </div>
          </ReferencePopover>
        </div>
      </section>
    </main>
  );
}
