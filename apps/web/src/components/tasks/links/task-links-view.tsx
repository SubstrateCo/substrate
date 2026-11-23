import { taskStatusLabels, type TaskStatus } from "@substrate/contracts/tasks";
import {
  taskLinkRelationLabels,
  taskLinkRelations,
  type TaskLinkRelation,
} from "@substrate/contracts/tasks/links";

import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { TaskBlockedCue } from "../list/task-list-item";
import { TaskStatusIcon } from "../task-cues/task-status-icon";
import type { TaskRelation } from "./task-relations";
import { ContentNotice } from "@/components/feedback/content-notice";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RecordLink } from "@/lib/navigation/record-links";
import { LockKeyhole, Plus, X } from "lucide-react";

const rowClass =
  "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * A task's links to other tasks, grouped by relation. A task in this project opens in place; a
 * task in another project is a link to that project. A task the reader cannot open has no title.
 */
export function TaskLinks({
  relations,
  projectEntityId,
  blocked,
  onSelect,
  linkFor,
  onRemove,
  pending = false,
  add,
}: {
  relations: TaskRelation[];
  projectEntityId: string;
  /** This task is open and waits on an open task. */
  blocked: boolean;
  onSelect: (taskEntityId: string) => void;
  linkFor: (other: NonNullable<TaskRelation["other"]>) => RecordLink;
  /** Set for editors. */
  onRemove?: (linkId: string) => void;
  pending?: boolean;
  add?: ReactNode;
}) {
  const groups = taskLinkRelations
    .map((relation) => ({
      relation,
      rows: relations.filter((candidate) => candidate.relation === relation),
    }))
    .filter((group) => group.rows.length);
  return (
    <section aria-label="Linked tasks" className="space-y-1">
      <div className="flex h-7 items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          Linked tasks
          {!!relations.length && (
            <span className="font-normal tabular-nums">{relations.length}</span>
          )}
          {blocked && <TaskBlockedCue />}
        </h3>
        {add}
      </div>
      {!relations.length && <ContentNotice variant="inline" title="No linked tasks" />}
      {groups.map(({ relation, rows }) => {
        const label = taskLinkRelationLabels[relation];
        return (
          <div key={relation} role="group" aria-label={label}>
            <p aria-hidden="true" className="pt-1 text-xs text-muted-foreground">
              {label}
            </p>
            <ul className="-mx-2 grid gap-px">
              {rows.map(({ id, other }) => {
                const name = other?.title ?? "A task you can’t open";
                const dimmed =
                  other && (other.status === "completed" || other.status === "canceled");
                const content = other ? (
                  <>
                    <span className="sr-only">{taskStatusLabels[other.status]}: </span>
                    <TaskStatusIcon status={other.status} />
                    <span className={`truncate ${dimmed ? "text-muted-foreground" : ""}`}>
                      {other.title}
                    </span>
                    {other.projectEntityId !== projectEntityId && (
                      <span className="max-w-2/5 shrink-0 truncate text-xs text-muted-foreground">
                        <span className="sr-only">, in </span>
                        {other.projectName}
                      </span>
                    )}
                  </>
                ) : null;
                return (
                  <li key={id} className="group/link flex min-w-0 items-center gap-1">
                    {!other && (
                      <span className="flex h-8 min-w-0 flex-1 items-center gap-2 px-2 text-sm text-muted-foreground">
                        <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
                        <span className="truncate">{name}</span>
                      </span>
                    )}
                    {other && other.projectEntityId === projectEntityId && (
                      <button
                        type="button"
                        className={rowClass}
                        onClick={() => onSelect(other.entityId)}
                      >
                        {content}
                      </button>
                    )}
                    {other && other.projectEntityId !== projectEntityId && (
                      <Link {...linkFor(other)} className={rowClass}>
                        {content}
                      </Link>
                    )}
                    {onRemove && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={pending}
                            aria-label={`Remove link: ${label} ${name}`}
                            onClick={() => onRemove(id)}
                          >
                            <X aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove link</TooltipContent>
                      </Tooltip>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

export type LinkCandidate = {
  id: string;
  title: string;
  status?: TaskStatus;
  projectName?: string;
};

/** The add control: choose how this task relates to another one, then search for that task. */
export function TaskLinkPicker({
  open,
  onOpenChange,
  relation,
  onRelationChange,
  query,
  onQueryChange,
  results,
  loading,
  searchError,
  pending,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  relation: TaskLinkRelation;
  onRelationChange: (relation: TaskLinkRelation) => void;
  query: string;
  onQueryChange: (query: string) => void;
  results: LinkCandidate[];
  loading: boolean;
  searchError?: Error | null;
  pending: boolean;
  onPick: (taskEntityId: string) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Link a task">
              <Plus aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Link a task</TooltipContent>
      </Tooltip>
      <PopoverContent variant="menu" align="end" className="w-80">
        <Select
          value={relation}
          onValueChange={(next) => {
            const value = taskLinkRelations.find((candidate) => candidate === next);
            if (value) onRelationChange(value);
          }}
        >
          <SelectTrigger aria-label="How this task relates" className="w-full">
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground">This task </span>
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {taskLinkRelations.map((value) => (
              <SelectItem key={value} value={value}>
                {taskLinkRelationLabels[value].toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Command shouldFilter={false} label="Search tasks to link">
          <CommandInput placeholder="Search tasks." value={query} onValueChange={onQueryChange} />
          <CommandList className="mt-1">
            {loading && (
              <p role="status" className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <Spinner aria-hidden="true" className="size-3.5" />
                Searching tasks.
              </p>
            )}
            {!loading && searchError && (
              <p role="alert" className="px-2 py-1.5 text-sm text-destructive">
                Couldn’t search tasks.
              </p>
            )}
            {!loading && !searchError && <CommandEmpty>No tasks match.</CommandEmpty>}
            {!loading && !!results.length && (
              <CommandGroup>
                {results.map((task) => (
                  <CommandItem
                    key={task.id}
                    value={task.id}
                    disabled={pending}
                    onSelect={() => onPick(task.id)}
                  >
                    {task.status && <TaskStatusIcon status={task.status} />}
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    {task.projectName && (
                      <span className="max-w-2/5 shrink-0 truncate text-xs text-muted-foreground">
                        {task.projectName}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
