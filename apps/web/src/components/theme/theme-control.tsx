import { SegmentedControl } from "../forms/segmented-control";
import { useTheme } from "./theme-context";
import { Monitor, Moon, Sun } from "lucide-react";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeControl({ iconOnly = false }: { iconOnly?: boolean }) {
  const { theme, setTheme } = useTheme();
  return (
    <SegmentedControl
      aria-label="Theme"
      value={theme}
      options={options}
      iconOnly={iconOnly}
      onValueChange={setTheme}
    />
  );
}
