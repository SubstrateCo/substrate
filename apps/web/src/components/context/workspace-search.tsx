import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@startup-os/ui/primitives/input";
import { Button } from "@startup-os/ui/primitives/button";
import { LoadingState } from "@startup-os/ui/feedback/loading-state";
import { ErrorState } from "@startup-os/ui/feedback/error-state";
import { searchOptions } from "@/queries/context/options";
import { messageHref, workHref } from "@/lib/context-links";

export function WorkspaceSearch({
  organizationId,
  onClose,
}: {
  organizationId: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "task" | "project" | "message" | "conversation">("all");
  const [after, setAfter] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const results = useQuery(searchOptions({ organizationId, query, kind, after, limit: 30 }));
  return (
    <section
      aria-label="Workspace search"
      className="max-h-96 space-y-3 overflow-auto border-b bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <Input
          ref={input}
          type="search"
          aria-label="Search workspace"
          placeholder="Search your accessible work…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAfter(undefined);
          }}
        />
        <Button variant="ghost" onClick={onClose}>
          Close search
        </Button>
      </div>
      <div role="group" aria-label="Search type" className="flex flex-wrap gap-2">
        {(["all", "task", "project", "message", "conversation"] as const).map((type) => (
          <Button
            key={type}
            size="xs"
            variant="outline"
            aria-pressed={kind === type}
            onClick={() => {
              setKind(type);
              setAfter(undefined);
            }}
          >
            {type}
          </Button>
        ))}
      </div>
      {results.isPending && <LoadingState label="Searching workspace" variant="compact" />}
      {results.error && (
        <ErrorState
          compact
          title="Couldn’t search workspace"
          onRetry={() => void results.refetch()}
        />
      )}
      {!results.error && results.data?.length === 0 && <p>No accessible results found.</p>}
      <ul className="space-y-2">
        {!results.error &&
          results.data?.map((item) => {
            const href = item.conversationId
              ? messageHref(
                  organizationId,
                  item.conversationId,
                  item.kind === "message" ? item.id : undefined,
                )
              : workHref(
                  organizationId,
                  item.projectEntityId!,
                  item.kind === "task" ? item.id : undefined,
                );
            return (
              <li key={item.id}>
                <a className="block rounded border p-2 text-sm hover:bg-accent" href={href}>
                  <span className="text-xs text-muted-foreground">{item.kind} · </span>
                  {item.title.replace(/@\[[^\]]+\]/g, "[Reference]")}
                </a>
              </li>
            );
          })}
      </ul>
      {results.data?.length === 30 && (
        <Button variant="outline" onClick={() => setAfter(results.data?.at(-1)?.id)}>
          More results
        </Button>
      )}
      {after && (
        <Button variant="ghost" onClick={() => setAfter(undefined)}>
          First results
        </Button>
      )}
    </section>
  );
}
