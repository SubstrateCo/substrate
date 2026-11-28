import type { AgentRoutineView } from "@substrate/contracts/agent-work";

import { RoutineRow, RoutineRowLoading, type RoutineRowActions } from "./routine-row";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { ListBody } from "@/components/feedback/list-body";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { recordRows } from "@/components/layout/record-section";
import { SettingsList, SettingsSection } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Item, ItemContent } from "@/components/ui/item";
import { routineHighlights } from "@/lib/agent-work/routine-groups";
import { listPhase } from "@/lib/resource-state";
import { ArrowRight, CalendarClock, Plus } from "lucide-react";

const countLabel = (count: number) => `${count} ${count === 1 ? "routine" : "routines"}`;

export function RoutineSummaryView({
  routines,
  now,
  loading,
  error,
  onRetry,
  onAdd,
  onShowAll,
  ...actions
}: {
  routines: AgentRoutineView[];
  now: number;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onAdd: () => void;
  onShowAll: () => void;
} & RoutineRowActions) {
  const { needsYou, upcoming, activeCount, pausedCount } = routineHighlights(routines, { now });
  const shown = [...needsYou, ...upcoming];
  const description = routines.length
    ? `${countLabel(routines.length)} · ${activeCount} active · ${pausedCount} paused`
    : undefined;
  return (
    <SettingsSection
      title="Routines"
      description={description}
      actions={
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Plus aria-hidden="true" />
          New routine
        </Button>
      }
    >
      <ListBody
        phase={listPhase({ items: routines, loading, error })}
        loading={
          <div role="status" aria-label="Loading routines">
            <SettingsList hidden>
              <RoutineRowLoading />
            </SettingsList>
          </div>
        }
        error={<ErrorState variant="compact" title="Couldn’t load routines" onRetry={onRetry} />}
        empty={<ContentNotice variant="compact" icon={CalendarClock} title="No routines yet" />}
        stale={<StaleNotice title="Couldn’t refresh routines" onRetry={onRetry} />}
      >
        {() => (
          <ul aria-label="Routines that need you and the next runs" className={recordRows}>
            {shown.map((routine) => (
              <RoutineRow key={routine.id} routine={routine} {...actions} />
            ))}
            <li>
              <Item asChild size="xs">
                <button type="button" className="text-left hover:bg-row-hover" onClick={onShowAll}>
                  <ItemContent className="min-w-0">
                    <span className="text-primary">
                      {shown.length < routines.length
                        ? `Show all ${countLabel(routines.length)}`
                        : "Manage routines"}
                    </span>
                  </ItemContent>
                  <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
                </button>
              </Item>
            </li>
          </ul>
        )}
      </ListBody>
    </SettingsSection>
  );
}
