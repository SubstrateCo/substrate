import type { DesktopUpdatesAPI } from "@substrate/contracts/desktop/updates-ipc";

import { Link } from "@tanstack/react-router";

import { updateRailLabel } from "./update-rail-label";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDesktopUpdates } from "@/hooks/use-desktop-updates";
import { updatesBridge } from "@/lib/desktop/bridges";
import { CircleArrowUp } from "lucide-react";

export function DesktopUpdateRail() {
  const bridge = updatesBridge();
  if (!bridge) return null;
  return <ConnectedUpdateRail bridge={bridge} />;
}

function ConnectedUpdateRail({ bridge }: { bridge: DesktopUpdatesAPI }) {
  const status = useDesktopUpdates(bridge);
  const label = status && updateRailLabel(status);
  if (!label) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="rail" size="icon-lg" className="relative" asChild>
          <Link to="/settings/user/preferences" hash="updates" aria-label={label}>
            <CircleArrowUp aria-hidden="true" className="size-5" />
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 size-1.5 rounded-full bg-warning ring-1 ring-rail"
            />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
