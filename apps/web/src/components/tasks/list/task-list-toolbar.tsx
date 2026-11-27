import type { ReactNode } from "react";

import type { ProjectDetail } from "../types";
import {
  taskFilterValue,
  withTaskFilterValue,
  type TaskFilterFieldId,
  type TaskFilters,
  type TaskSort,
} from "./task-filters";
import { TaskFilterLayout } from "./task-list-layout";
import { AgentAvatarView } from "@/components/agents/agent-avatar";
import {
  FilterBar,
  SortControl,
  type FilterField,
  type FilterOption,
  type SortOption,
} from "@/components/filters";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Input } from "@/components/ui/input";
import { ListTodo, UserRound } from "lucide-react";

const sortOptions: SortOption<TaskSort>[] = [
  { value: "default", label: "Task ID" },
  { value: "priority", label: "Priority" },
  { value: "dueDate", label: "Due date" },
  { value: "title", label: "Title" },
];

/** The scope and assignee filter fields. A chosen actor who left the project reads "Former member". */
function taskFilterFields(
  assignees: ProjectDetail["actors"],
  assignee: TaskFilters["assignee"],
): FilterField<TaskFilterFieldId>[] {
  const actorOption = (actor: ProjectDetail["actors"][number]): FilterOption => ({
    value: actor.entityId,
    label: actor.name,
    icon:
      actor.type === "agent" ? (
        <AgentAvatarView avatar={actor.avatar} size="xs" />
      ) : (
        <PersonAvatar size="xs" name={actor.name} image={actor.image} />
      ),
    group: actor.type === "agent" ? "Agents" : "People",
  });
  const former =
    assignee !== "any" &&
    assignee !== "unassigned" &&
    !assignees.some((actor) => actor.entityId === assignee);
  return [
    {
      id: "scope",
      label: "Scope",
      icon: ListTodo,
      kind: "option",
      options: [
        { value: "active", label: "Active" },
        { value: "blocked", label: "Blocked" },
      ],
    },
    {
      id: "assignee",
      label: "Assignee",
      icon: UserRound,
      kind: "option",
      options: [
        { value: "unassigned", label: "Unassigned", icon: <PersonAvatar size="xs" /> },
        ...(former ? [{ value: assignee, label: "Former member" }] : []),
        ...assignees.filter((actor) => actor.type === "human").map(actorOption),
        ...assignees.filter((actor) => actor.type === "agent").map(actorOption),
      ],
    },
  ];
}

/** Text filter, scope and assignee filters, and sort for one project's tasks. */
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
  const set = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });
  return (
    <TaskFilterLayout toolbar>
      <Input
        // On one row, the search shares the spare width with the pills, between 10rem and 18rem.
        className="w-full max-w-full @lg:w-72 @3xl:max-w-72 @3xl:min-w-40 @3xl:flex-1"
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
      {/*
        Pills start at their full width, so the search shrinks first; past its minimum they wrap
        inside this box, and the right group stays on the row. The padding centres the first
        line of pills on the search.
      */}
      <div className="flex-1 py-0.5 @3xl:min-w-0 @3xl:flex-auto">
        <FilterBar
          fields={taskFilterFields(assignees, filters.assignee)}
          value={taskFilterValue(filters)}
          onValueChange={(value) => onChange(withTaskFilterValue(filters, value))}
          // With no matches, the empty state offers its own "Clear filters".
          clearable={shown > 0}
        />
      </div>
      <div className="ml-auto flex h-8 shrink-0 items-center gap-2">
        {filtered && (
          <p role="status" className="text-xs text-muted-foreground tabular-nums">
            {shown} of {total}
          </p>
        )}
        <SortControl
          options={sortOptions}
          value={filters.sort}
          onValueChange={(sort) => set({ sort })}
        />
        {viewControl}
      </div>
    </TaskFilterLayout>
  );
}
