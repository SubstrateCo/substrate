import type { AgentRoutineView } from "@substrate/contracts/agent-work";

import { useState } from "react";

import { RoutineRow, RoutineRowLoading, type RoutineRowActions } from "./routine-row";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { ListBody } from "@/components/feedback/list-body";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { RecordSection, recordRows } from "@/components/layout/record-section";
import { SettingsList } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemDescription } from "@/components/ui/item";
import {
  groupRoutines,
  type RoutineFilter,
  type RoutineGroup,
} from "@/lib/agent-work/routine-groups";
import { listPhase } from "@/lib/resource-state";
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
  routines,
  now,
  loading,
  error,
  onRetry,
  onAdd,
  ...actions
}: {
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
  return (
    <div className="grid min-w-0 gap-4">
      {routines.length > 0 && (
        <div className="grid min-w-0 gap-3">
          <div className="flex items-center gap-2">
            <Input
              type="search"
              aria-label="Search routines"
              placeholder={`Search ${routines.length} routines`}
              className="min-w-0 flex-1"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <NewRoutineButton onAdd={onAdd} />
          </div>
          <SegmentedControl
            aria-label="Show routines"
            value={filter}
            options={filterOptions}
            onValueChange={setFilter}
          />
        </div>
      )}
      <ListBody
        phase={listPhase({ items: routines, loading, error })}
        loading={
          <div role="status" aria-label="Loading routines">
            <SettingsList hidden>
              <RoutineRowLoading />
              <RoutineRowLoading />
            </SettingsList>
          </div>
        }
        error={<ErrorState variant="compact" title="Couldn’t load routines" onRetry={onRetry} />}
        empty={
          <ContentNotice
            variant="compact"
            icon={CalendarClock}
            title="No routines yet"
            action={<NewRoutineButton onAdd={onAdd} />}
          />
        }
        stale={<StaleNotice title="Couldn’t refresh routines" onRetry={onRetry} />}
      >
        {() =>
          groups.length ? (
            <div className="grid min-w-0 gap-6" role="list" aria-label="Routines">
              {groups.map(({ group, routines: items }) => (
                <div role="listitem" key={group}>
                  <RecordSection title={groupTitles[group]} count={items.length}>
                    <ul aria-label={groupTitles[group]} className={recordRows}>
                      {items.map((routine) => (
                        <RoutineRow
                          key={routine.id}
                          routine={routine}
                          detail={<ItemDescription>{routine.prompt}</ItemDescription>}
                          {...actions}
                        />
                      ))}
                    </ul>
                  </RecordSection>
                </div>
              ))}
            </div>
          ) : (
            <ContentNotice variant="compact" icon={Search} title="No routines match" />
          )
        }
      </ListBody>
    </div>
  );
}
