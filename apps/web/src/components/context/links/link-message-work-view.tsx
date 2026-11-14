import type { ContextEntityType } from "@substrate/contracts/context/input";

import { useState } from "react";

import { ErrorState } from "../../feedback/error-state";
import { LoadingState } from "../../feedback/loading-state";
import { PendingButton } from "../../feedback/pending-button";
import { Button } from "../../ui/button";
import { Command, CommandEmpty, CommandInput, CommandList } from "../../ui/command";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import { LinkWorkItem } from "./link-work-item";
import type { ResourceStatus } from "@/lib/resource-state";
import { Link2, Plus } from "lucide-react";

const kindOptions = [
  { value: "task", label: "Tasks" },
  { value: "project", label: "Projects" },
  { value: "contact", label: "Contacts" },
  { value: "account", label: "Accounts" },
  { value: "deal", label: "Deals" },
  { value: "contact_interaction", label: "Interactions" },
] as const;

export type LinkableWork = {
  id: string;
  kind: ContextEntityType;
  title: string;
  projectEntityId: string | null;
  projectName?: string;
};

export function LinkMessageWork({
  query,
  state,
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
  onRestoreFocus,
  onCreate,
}: {
  query: string;
  state: ResourceStatus;
  kind: ContextEntityType;
  results: LinkableWork[];
  linkedIds: ReadonlySet<string>;
  loading: boolean;
  error?: Error | null;
  pending: boolean;
  onQueryChange: (query: string) => void;
  onKindChange: (kind: ContextEntityType) => void;
  onRetry: () => void;
  onLink: (items: LinkableWork[]) => void;
  onClose: () => void;
  /** Focus a stable control on close, because the menu item that opened the dialog is gone. */
  onRestoreFocus?: () => void;
  onCreate?: (kind: "account" | "contact" | "deal") => void;
}) {
  // Selection survives tab and search changes, so tasks and projects can be linked together.
  const [chosen, setChosen] = useState(() => new Map<string, LinkableWork>());
  const visible = results;
  const kindLabel = kindOptions.find((option) => option.value === kind)!.label;
  // Items that became linked, for example after a partial failure, leave the selection.
  const selection =
    state === "unavailable" ? [] : [...chosen.values()].filter((item) => !linkedIds.has(item.id));
  const toggle = (item: LinkableWork) =>
    setChosen((current) => {
      const next = new Map(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  let linkLabel = "Link";
  if (selection.length === 1) linkLabel = "Link item";
  else if (selection.length > 1) linkLabel = `Link ${selection.length} items`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (!onRestoreFocus) return;
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Link existing records</DialogTitle>
          <DialogDescription>
            Choose work or CRM records to attach to this message. Linking does not share either side
            or publish the message to record readers.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Command shouldFilter={false}>
            <div className="flex flex-col gap-3">
              <Tabs
                value={kind}
                onValueChange={(value) => {
                  const option = kindOptions.find((item) => item.value === value);
                  if (option) onKindChange(option.value);
                }}
              >
                <TabsList aria-label="Record type" className="flex-wrap">
                  {kindOptions.map((option) => (
                    <TabsTrigger key={option.value} value={option.value} disabled={pending}>
                      {option.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              {onCreate && (kind === "account" || kind === "contact" || kind === "deal") && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || state === "unavailable"}
                  onClick={() => onCreate(kind)}
                >
                  <Plus aria-hidden="true" /> Create {kind} from this message
                </Button>
              )}
              <CommandInput
                aria-label="Search work to link"
                placeholder={`Search ${kindLabel.toLowerCase()}…`}
                value={query}
                onValueChange={onQueryChange}
                disabled={pending}
              />
              {selection.length > 0 && (
                <div aria-label="Selected work" className="flex flex-wrap gap-1">
                  {selection.map((item) => (
                    <Button
                      key={item.id}
                      type="button"
                      variant="secondary"
                      size="chip"
                      className="max-w-full"
                      disabled={pending}
                      onClick={() => toggle(item)}
                      aria-label={`Remove ${item.title} from selection`}
                    >
                      <span className="min-w-0 wrap-anywhere">
                        {item.title}{" "}
                        <span className="text-muted-foreground">
                          ·{" "}
                          {item.projectName ??
                            kindOptions.find((option) => option.value === item.kind)!.label}
                        </span>
                      </span>{" "}
                      <span aria-hidden="true">×</span>
                    </Button>
                  ))}
                </div>
              )}
              <div className="rounded-lg border p-1">
                <CommandList aria-label={kindLabel} className="h-72">
                  {loading && !visible.length && (
                    <LoadingState label="Searching work" variant="compact" />
                  )}
                  {error && <ErrorState compact title="Couldn’t search work" onRetry={onRetry} />}
                  {!loading && !error && (
                    <CommandEmpty>
                      {query.trim()
                        ? `No editable ${kindLabel.toLowerCase()} match “${query.trim()}”.`
                        : `No editable ${kindLabel.toLowerCase()} found.`}
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
        </DialogBody>
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
