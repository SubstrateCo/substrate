import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw } from "lucide-react";

export type HarnessAvailabilityState =
  | { kind: "desktop-required" }
  | { kind: "checking" }
  | { kind: "error" }
  | { kind: "ready"; available: boolean; version?: string };

function describe(label: string, state: HarnessAvailabilityState) {
  switch (state.kind) {
    case "desktop-required":
      return { tone: "bg-muted-foreground", text: "Open the desktop app to check availability." };
    case "checking":
      return { tone: "bg-muted-foreground", text: `Checking ${label}…` };
    case "error":
      return { tone: "bg-destructive", text: "Couldn't check availability." };
    case "ready":
      return state.available
        ? {
            tone: "bg-success",
            text: `${label} available${state.version ? ` · ${state.version}` : ""}`,
          }
        : { tone: "bg-destructive", text: `${label} is not available on this device.` };
  }
}

export function HarnessAvailabilityView({
  label,
  state,
  refreshing,
  onRefresh,
}: {
  label: string;
  state: HarnessAvailabilityState;
  refreshing: boolean;
  onRefresh?: () => void;
}) {
  const { tone, text } = describe(label, state);
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      {state.kind === "checking" ? (
        <Spinner aria-hidden="true" />
      ) : (
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${tone}`} />
      )}
      <span role="status" className="min-w-0 flex-1 truncate" title={text}>
        {text}
      </span>
      {onRefresh && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Check again"
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw className={refreshing ? "animate-spin" : ""} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Check again</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
