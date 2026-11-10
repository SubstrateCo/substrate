import type { ProjectDetail } from "../types";
import type { TaskFilters, TaskSort } from "./task-filters";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown, Search, UserRound, X } from "lucide-react";

const sortOptions: { value: TaskSort; label: string }[] = [
  { value: "default", label: "Default order" },
  { value: "priority", label: "Priority" },
  { value: "dueDate", label: "Due date" },
  { value: "title", label: "Title" },
];

const scopeOptions = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
] as const;

/** Text filter, scope, assignee filter, and sort for one project's tasks. */
export function TaskListToolbar({
  filters,
  onChange,
  assignees,
  filtered,
  shown,
  total,
}: {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  /** Actors that have at least one task in this project. */
  assignees: ProjectDetail["actors"];
  filtered: boolean;
  shown: number;
  total: number;
}) {
  const set = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });
  return (
    <div
      role="toolbar"
      aria-label="Task filters"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b px-6 py-2"
    >
      <InputGroup className="max-w-52 min-w-40 flex-1">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <input
          type="search"
          data-slot="input-group-control"
          aria-label="Filter tasks"
          placeholder="Filter tasks"
          value={filters.query}
          onChange={(event) => set({ query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape" && filters.query) {
              event.preventDefault();
              set({ query: "" });
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent pr-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
      </InputGroup>
      <SegmentedControl
        aria-label="Show tasks"
        value={filters.scope}
        options={scopeOptions}
        onValueChange={(scope) => set({ scope })}
      />
      <Select value={filters.assignee} onValueChange={(assignee) => set({ assignee })}>
        <SelectTrigger aria-label="Filter by assignee" className="max-w-48">
          <UserRound aria-hidden="true" className="text-muted-foreground" />
          <SelectValue />
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
          if (option) set({ sort: option.value });
        }}
      >
        <SelectTrigger aria-label="Sort tasks">
          <ArrowUpDown aria-hidden="true" className="text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {sortOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {filtered && (
        <>
          {shown > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => set({ query: "", assignee: "any", scope: "all" })}
            >
              <X aria-hidden="true" />
              Clear filters
            </Button>
          )}
          <p role="status" className="ml-auto text-xs text-muted-foreground tabular-nums">
            {shown} of {total}
          </p>
        </>
      )}
    </div>
  );
}
