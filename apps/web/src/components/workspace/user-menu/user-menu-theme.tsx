import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { Monitor, Moon, Sun } from "lucide-react";

const options = [
  { value: "light", label: "Light theme", icon: Sun },
  { value: "dark", label: "Dark theme", icon: Moon },
  { value: "system", label: "System theme", icon: Monitor },
] as const;

export function UserMenuTheme() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center justify-between gap-2 py-1 pr-1 pl-2">
      <span className="text-sm text-muted-foreground">Theme</span>
      <div role="group" aria-label="Theme" className="flex gap-0.5 rounded-md bg-muted p-0.5">
        {options.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            type="button"
            variant={theme === value ? "outline" : "ghost"}
            size="icon-xs"
            aria-label={label}
            aria-pressed={theme === value}
            title={label}
            onClick={() => setTheme(value)}
          >
            <Icon aria-hidden="true" />
          </Button>
        ))}
      </div>
    </div>
  );
}
