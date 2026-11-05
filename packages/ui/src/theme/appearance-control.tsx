import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "../primitives/button";
import { Switch } from "../primitives/switch";

export function AppearanceControl() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-1">
      <span className="text-sm font-medium">Appearance</span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Use system theme"
          aria-pressed={theme === "system"}
          title="Use system theme"
          onClick={() => setTheme("system")}
        >
          <Monitor />
        </Button>
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
              className={`absolute size-4 transition-all duration-200 motion-reduce:transition-none ${dark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}`}
            />
            <Moon
              className={`absolute size-4 transition-all duration-200 motion-reduce:transition-none ${dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}`}
            />
          </span>
        </Switch>
      </div>
    </div>
  );
}
