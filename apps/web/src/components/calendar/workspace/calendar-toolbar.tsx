import { SegmentedControl } from "@/components/forms/segmented-control";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CalendarViewMode } from "@/lib/calendar/days";
import { CalendarRange, ChevronLeft, ChevronRight, List } from "lucide-react";

const viewOptions = [
  { value: "agenda", label: "Agenda", icon: List },
  { value: "week", label: "Week", icon: CalendarRange },
] as const;

function StepButton({
  label,
  direction,
  onClick,
}: {
  label: string;
  direction: "previous" | "next";
  onClick: () => void;
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The period's name, paging, and the choice between the agenda and the week grid. */
export function CalendarToolbar({
  title,
  view,
  showsToday,
  onToday,
  onStep,
  onViewChange,
}: {
  title: string;
  view: CalendarViewMode;
  /** The period already includes today. */
  showsToday: boolean;
  onToday: () => void;
  onStep: (direction: 1 | -1) => void;
  onViewChange: (view: CalendarViewMode) => void;
}) {
  const unit = view === "week" ? "week" : "two weeks";
  return (
    <PageHeader
      variant="pane"
      title={title}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={showsToday} onClick={onToday}>
            Today
          </Button>
          <div role="group" aria-label="Change period" className="flex gap-0.5">
            <StepButton
              label={`Previous ${unit}`}
              direction="previous"
              onClick={() => onStep(-1)}
            />
            <StepButton label={`Next ${unit}`} direction="next" onClick={() => onStep(1)} />
          </div>
          <SegmentedControl
            aria-label="Calendar view"
            value={view}
            options={viewOptions}
            onValueChange={onViewChange}
          />
        </div>
      }
    />
  );
}
