import type { AgentRoutineView } from "@substrate/contracts/agent-work";

import { useState, type ReactNode } from "react";

import { RoutineRow, RoutineRowLoading, type RoutineRowActions } from "./routine-row";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { SettingsList } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  groupRoutines,
  type RoutineFilter,
  type RoutineGroup,
} from "@/lib/agent-work/routine-groups";
import { CalendarClock, Plus, Search } from "lucide-react";

const groupTitles: Record<RoutineGroup, string> = {
  needsYou: "Needs you",
  soon: "Next 24 hours",
  later: "Later",
  paused: "Paused",
};

const filterOptions = [
  { value: "all", label: "All" },
  { value: "needsYou", label: "Needs you" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
] as const satisfies readonly { value: RoutineFilter; label: string }[];

function NewRoutineButton({ onAdd }: { onAdd: () => void }) {
  return (
    <Button type="button" size="sm" onClick={onAdd}>
      <Plus aria-hidden="true" />
      New routine
    </Button>
  );
}

/**
 * Every routine of one agent, in groups: what needs the owner, the next 24 hours, later, and
 * paused. Search and a filter keep a long list short.
 */
export function RoutineListView({
  name,
  routines,
  now,
  loading,
  error,
  onRetry,
  onAdd,
  ...actions
}: {
  name: string;
  routines: AgentRoutineView[];
  now: number;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onAdd: () => void;
} & RoutineRowActions) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RoutineFilter>("all");
  const groups = groupRoutines(routines, { now, query, filter });
  let content: ReactNode;
  if (error && !routines.length)
    content = <ErrorState variant="compact" title="Couldn’t load routines" onRetry={onRetry} />;
  else if (loading && !routines.length)
    content = (
      <div role="status" aria-label="Loading routines">
        <SettingsList hidden>
          <RoutineRowLoading />
          <RoutineRowLoading />
        </SettingsList>
      </div>
    );
  else if (!routines.length)
    content = (
      <ContentNotice
        variant="compact"
        icon={CalendarClock}
        title="No routines yet"
        description={`A routine asks ${name} to do something on a schedule, like a summary every weekday at 9:00 AM.`}
        action={<NewRoutineButton onAdd={onAdd} />}
      />
    );
  else if (!groups.length)
    content = <ContentNotice variant="compact" icon={Search} title="No routines match" />;
  else
    content = (
      <div className="grid min-w-0 gap-6" role="list" aria-label="Routines">
        {groups.map(({ group, routines: items }) => (
          <div role="listitem" key={group}>
            <SettingsList title={`${groupTitles[group]} · ${items.length}`}>
              {items.map((routine) => (
                <RoutineRow key={routine.id} routine={routine} showPrompt {...actions} />
              ))}
            </SettingsList>
          </div>
        ))}
      </div>
    );
  return (
    <div className="grid min-w-0 gap-4">
      <p className="text-sm text-muted-foreground">
        Work {name} starts on a schedule. {name} can also add and change routines; you approve them
        before they run.
      </p>
      {routines.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            aria-label="Search routines"
            placeholder={`Search ${routines.length} routines`}
            className="w-72 max-w-full"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <SegmentedControl
            aria-label="Show routines"
            value={filter}
            options={filterOptions}
            onValueChange={setFilter}
          />
          <div className="ml-auto">
            <NewRoutineButton onAdd={onAdd} />
          </div>
        </div>
      )}
      {content}
      {error && routines.length > 0 && (
        <ErrorState variant="compact" title="Couldn’t refresh routines" onRetry={onRetry} />
      )}
    </div>
  );
}
