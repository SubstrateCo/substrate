import { DesktopTitleBarContent } from "@/components/desktop/desktop-title-bar-content";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Moon, Sun } from "lucide-react";

export function ArchiveTitleTools() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} theme`,
    Icon = next === "dark" ? Moon : Sun;
  return (
    <DesktopTitleBarContent position="end">
      <div className="flex shrink-0 items-center gap-1 text-rail-foreground">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="xs" className="max-md:hidden">
              <span className="size-1.5 rounded-full bg-chart-2" />
              Private archive
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end">
            <Heading level={2}>Your meeting archive</Heading>
            <p className="text-sm/relaxed text-muted-foreground">
              Only you can see this workspace’s archive, on any of your devices. Each row is one
              call. Open its Sources tab to compare the original records.
            </p>
          </PopoverContent>
        </Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              onClick={() => setTheme(next)}
            >
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </div>
    </DesktopTitleBarContent>
  );
}
