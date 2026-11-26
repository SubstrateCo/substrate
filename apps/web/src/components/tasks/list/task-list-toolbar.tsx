import type { ReactNode } from "react";

import type { ProjectDetail } from "../types";
import type { TaskFilters, TaskSort } from "./task-filters";
import { TaskFilterLayout } from "./task-list-layout";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ArrowUpDown, SlidersHorizontal, UserRound, X } from "lucide-react";

const sortOptions: { value: TaskSort; label: string }[] = [
  { value: "default", label: "Task ID" },
  { value: "priority", label: "Priority" },
  { value: "dueDate", label: "Due date" },
  { value: "title", label: "Title" },
];

const scopeOptions = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "blocked", label: "Blocked" },
] as const;

/** Text filter, scope, assignee filter, and sort for one project's tasks. */
export function TaskListToolbar({
  filters,
  onChange,
  assignees,
  filtered,
  shown,
  total,
  viewControl,
}: {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  /** Actors that have at least one task in this project. */
  assignees: ProjectDetail["actors"];
  filtered: boolean;
  shown: number;
  total: number;
  /** The view toggle, last at the right end. */
  viewControl?: ReactNode;
}) {
  const compact = useMediaQuery("(max-width: 639px)");
  const set = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });
  const clearFilters = (
    <Button
      type="button"
      variant="ghost"
      onClick={() => set({ query: "", assignee: "any", scope: "all" })}
    >
      <X aria-hidden="true" />
      Clear filters
    </Button>
  );
  const controls = (
    <TaskListControls filters={filters} assignees={assignees} compact={compact} onChange={set} />
  );
  return (
    <TaskFilterLayout toolbar>
      <Input
        className="w-full max-w-full @lg:w-72"
        type="search"
        aria-label="Search tasks"
        placeholder="Search tasks"
        value={filters.query}
        onChange={(event) => set({ query: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === "Escape" && filters.query) {
            event.preventDefault();
            set({ query: "" });
          }
        }}
      />
      {compact ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={filtered || filters.sort !== "default" ? "accent" : "outline"}>
              <SlidersHorizontal aria-hidden="true" />
              Filters
              {(filtered || filters.sort !== "default") && (
                <span className="sr-only">, active</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" aria-label="Task filters and sort">
            {controls}
            {filtered && clearFilters}
          </PopoverContent>
        </Popover>
      ) : (
        controls
      )}
      {filtered && (
        <>
          {!compact && shown > 0 && clearFilters}
          <p role="status" className="text-xs text-muted-foreground tabular-nums">
            {shown} of {total}
          </p>
        </>
      )}
      {viewControl && <div className="ml-auto">{viewControl}</div>}
    </TaskFilterLayout>
  );
}

function assigneeLabel(assignees: ProjectDetail["actors"], assignee: TaskFilters["assignee"]) {
  if (assignee === "any") return "Any assignee";
  if (assignee === "unassigned") return "Unassigned";
  return assignees.find((actor) => actor.entityId === assignee)?.name ?? "Former member";
}

/** Scope, assignee, and sort controls. */
function TaskListControls({
  filters,
  assignees,
  compact,
  onChange,
}: {
  filters: TaskFilters;
  assignees: ProjectDetail["actors"];
  compact: boolean;
  onChange: (patch: Partial<TaskFilters>) => void;
}) {
  return (
    <>
      <SegmentedControl
        aria-label="Show tasks"
        value={filters.scope}
        options={scopeOptions}
        onValueChange={(scope) => onChange({ scope })}
      />
      <Select value={filters.assignee} onValueChange={(assignee) => onChange({ assignee })}>
        <SelectTrigger
          aria-label="Filter by assignee"
          title={assigneeLabel(assignees, filters.assignee)}
          className={compact ? "w-full" : "max-w-48"}
        >
          <UserRound aria-hidden="true" className="text-muted-foreground" />
          <span className="min-w-0 truncate">
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value="any">Any assignee</SelectItem>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {!!assignees.length && <SelectSeparator />}
          {assignees.map((actor) => (
            <SelectItem key={actor.entityId} value={actor.entityId}>
              {actor.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.sort}
        onValueChange={(next) => {
          const option = sortOptions.find((candidate) => candidate.value === next);
          if (option) onChange({ sort: option.value });
        }}
      >
        <SelectTrigger aria-label="Sort tasks" className={compact ? "w-full" : undefined}>
          <ArrowUpDown aria-hidden="true" className="text-muted-foreground" />
          <span>
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {sortOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
