import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

export type SettingsNavItem<T extends string> = { value: T; label: string; icon: LucideIcon };

/**
 * The section list of a settings page. It is a column beside the settings in wide panes and a
 * scrolling row above them in narrow panes. Its parent must be a `@container`.
 */
export function SettingsNav<T extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly SettingsNavItem<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <nav
      aria-label={label}
      className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-1 @3xl:sticky @3xl:top-0 @3xl:mx-0 @3xl:w-44 @3xl:shrink-0 @3xl:flex-col @3xl:overflow-visible @3xl:px-0 @3xl:pb-0"
    >
      {items.map(({ value: item, label: itemLabel, icon: Icon }) => (
        <Button
          key={item}
          type="button"
          variant={item === value ? "secondary" : "ghost"}
          aria-current={item === value ? "true" : undefined}
          className="shrink-0 justify-start @3xl:w-full"
          onClick={() => onChange(item)}
        >
          <Icon aria-hidden="true" />
          {itemLabel}
        </Button>
      ))}
    </nav>
  );
}
