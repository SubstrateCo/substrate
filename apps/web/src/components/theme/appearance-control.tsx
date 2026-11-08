import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useTheme } from "./theme-provider";
import { Monitor, Moon, Sun } from "lucide-react";

export function AppearanceControl() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <div className="flex items-center justify-between gap-4 rounded-md px-3 py-2">
      <span className="text-sm font-medium">Appearance</span>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={theme === "system" ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label="Use system theme"
              aria-pressed={theme === "system"}
              onClick={() => setTheme("system")}
            >
              <Monitor />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Use system theme</TooltipContent>
        </Tooltip>
        <Switch
          aria-label="Dark mode"
          checked={dark}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center text-foreground"
          >
            <Sun
              className={`absolute size-2.5 transition-opacity duration-150 ${dark ? "opacity-0" : "opacity-100"}`}
            />
            <Moon
              className={`absolute size-2.5 transition-opacity duration-150 ${dark ? "opacity-100" : "opacity-0"}`}
            />
          </span>
        </Switch>
      </div>
    </div>
  );
}
