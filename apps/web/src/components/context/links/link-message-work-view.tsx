import { useState } from "react";

import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { PendingButton } from "../../feedback/pending-button";
import { isAccessFailure } from "../../feedback/request-failure";
import { Button } from "../../ui/button";
import { Command, CommandEmpty, CommandInput, CommandList } from "../../ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { LinkWorkItem } from "./link-work-item";
import { Link2 } from "lucide-react";

export type LinkableWork = {
  id: string;
  kind: "task" | "project";
  title: string;
  projectEntityId: string;
  projectName?: string;
};

export function LinkMessageWork({
  query,
  kind,
  results,
  linkedIds,
  loading,
  error,
  pending,
  onQueryChange,
  onKindChange,
  onRetry,
  onLink,
  onClose,
}: {
  query: string;
  kind: "task" | "project";
  results: LinkableWork[];
  linkedIds: ReadonlySet<string>;
  loading: boolean;
  error?: Error | null;
  pending: boolean;
  onQueryChange: (query: string) => void;
  onKindChange: (kind: "task" | "project") => void;
  onRetry: () => void;
  onLink: (items: LinkableWork[]) => void;
  onClose: () => void;
}) {
  // Selection survives tab and search changes, so tasks and projects can be linked together.
  const [chosen, setChosen] = useState(() => new Map<string, LinkableWork>());
  const visible = isAccessFailure(error) ? [] : results;
  // Items that became linked, for example after a partial failure, leave the selection.
  const selection = [...chosen.values()].filter((item) => !linkedIds.has(item.id));
  const toggle = (item: LinkableWork) =>
    setChosen((current) => {
      const next = new Map(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  let linkLabel = "Link";
  if (selection.length === 1) linkLabel = `Link ${selection[0]!.kind}`;
  else if (selection.length > 1) linkLabel = `Link ${selection.length} items`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link existing work</DialogTitle>
          <DialogDescription>
            Choose tasks or projects to attach to this message. Only people with access can open
            them. Linking does not share them.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false}>
          <div className="flex flex-col gap-3">
            <div role="group" aria-label="Work type" className="flex gap-2">
              <Button
                size="sm"
                variant={kind === "task" ? "secondary" : "outline"}
                aria-pressed={kind === "task"}
                disabled={pending}
                onClick={() => onKindChange("task")}
              >
                Tasks
              </Button>
              <Button
                size="sm"
                variant={kind === "project" ? "secondary" : "outline"}
                aria-pressed={kind === "project"}
                disabled={pending}
                onClick={() => onKindChange("project")}
              >
                Projects
              </Button>
            </div>
            <CommandInput
              aria-label="Search work to link"
              placeholder={kind === "task" ? "Search tasks…" : "Search projects…"}
              value={query}
              onValueChange={onQueryChange}
              disabled={pending}
            />
            <div className="rounded-lg border p-1">
              <CommandList aria-label={kind === "task" ? "Tasks" : "Projects"} className="h-72">
                {loading && !visible.length && (
                  <LoadingState label="Searching work" variant="compact" />
                )}
                {error && <ErrorState compact title="Couldn't search work" onRetry={onRetry} />}
                {!loading && !error && (
                  <CommandEmpty>
                    {query.trim()
                      ? `No editable ${kind === "task" ? "tasks" : "projects"} match “${query.trim()}”.`
                      : `No editable ${kind === "task" ? "tasks" : "projects"} found.`}
                  </CommandEmpty>
                )}
                {visible.map((item) => (
                  <LinkWorkItem
                    key={item.id}
                    id={item.id}
                    kind={item.kind}
                    title={item.title}
                    projectName={item.projectName}
                    chosen={chosen.has(item.id)}
                    linked={linkedIds.has(item.id)}
                    disabled={pending}
                    onChoose={() => toggle(item)}
                  />
                ))}
              </CommandList>
            </div>
          </div>
        </Command>
        <DialogFooter className="items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {selection.length ? `${selection.length} selected` : "Select one or more items"}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <PendingButton
              type="button"
              pending={pending}
              pendingLabel="Linking…"
              disabled={!selection.length || pending}
              onClick={() => onLink(selection)}
            >
              <Link2 aria-hidden="true" /> {linkLabel}
            </PendingButton>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
