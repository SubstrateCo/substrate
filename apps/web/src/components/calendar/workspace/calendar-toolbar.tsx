import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CalendarViewMode } from "@/lib/calendar/days";
import { ChevronLeft, ChevronRight } from "lucide-react";

const viewOptions = [
  { value: "agenda", label: "Agenda" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
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

/** The period's name, paging, and calendar view. */
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
  const unit = view === "agenda" ? "two weeks" : view;
  return (
    <PageHeader
      variant="pane"
      title={<span className="my-2 block">{title}</span>}
      className="h-auto min-h-12 flex-wrap [&>div:last-child]:max-w-full [&>div:last-child]:shrink"
      actions={
        <div className="my-2 flex max-w-full flex-wrap items-center gap-2">
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
          <Select
            value={view}
            onValueChange={(next) => {
              if (next === "agenda" || next === "week" || next === "month") onViewChange(next);
            }}
          >
            <SelectTrigger size="sm" aria-label="Calendar view">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {viewOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    />
  );
}
