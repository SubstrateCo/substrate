import { Button } from "../primitives/button";
import { Switch } from "../primitives/switch";
import { useTheme } from "./theme-provider";
import { Monitor, Moon, Sun } from "lucide-react";

export function AppearanceControl() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-1">
      <span className="text-sm font-medium">Appearance</span>
      <div className="flex items-center gap-2">
        <Button
          variant={theme === "system" ? "secondary" : "outline"}
          size="sm"
          aria-label="Use system theme"
          aria-pressed={theme === "system"}
          title="Use system theme"
          onClick={() => setTheme("system")}
        >
          <Monitor />
          System
        </Button>
        <span className="text-xs text-muted-foreground">{dark ? "Dark" : "Light"}</span>
        <Switch
          size="appearance"
          aria-label="Dark mode"
          checked={dark}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center text-foreground"
          >
            <Sun
              className={`absolute size-4 transition-opacity duration-150 ${dark ? "opacity-0" : "opacity-100"}`}
            />
            <Moon
              className={`absolute size-4 transition-opacity duration-150 ${dark ? "opacity-100" : "opacity-0"}`}
            />
          </span>
        </Switch>
      </div>
    </div>
  );
}
