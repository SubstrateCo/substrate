import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

type SettingsNavItem<T extends string> = { value: T; label: string; icon: LucideIcon };
export type SettingsNavGroup<T extends string> = {
  id: string;
  /** A small heading above the group in the wide layout. */
  label?: string;
  items: readonly SettingsNavItem<T>[];
};

/**
 * The section list of a page: a column beside the content in wide panes and a scrolling row
 * above it in narrow panes. Its parent must be a `@container`.
 */
export function SettingsNav<T extends string>({
  label,
  groups,
  value,
  marked,
  onChange,
  disabled,
}: {
  label: string;
  groups: readonly SettingsNavGroup<T>[];
  value: T;
  /** Items that hold unsaved changes. They get a dot. */
  marked?: readonly T[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const markedItems = useMemo(() => (marked?.length ? new Set(marked) : undefined), [marked]);
  return (
    <nav
      aria-label={label}
      className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-1 @3xl:sticky @3xl:top-0 @3xl:mx-0 @3xl:w-48 @3xl:shrink-0 @3xl:flex-col @3xl:gap-5 @3xl:overflow-visible @3xl:px-0 @3xl:pb-0"
    >
      {groups.map((group) => (
        <div
          key={group.id}
          role="group"
          aria-label={group.label}
          className="flex shrink-0 gap-1 @3xl:flex-col @3xl:gap-0.5"
        >
          {group.label && (
            <p
              aria-hidden="true"
              className="hidden px-2 pb-1 text-xs font-medium text-muted-foreground @3xl:block"
            >
              {group.label}
            </p>
          )}
          {group.items.map(({ value: item, label: itemLabel, icon: Icon }) => (
            <Button
              key={item}
              type="button"
              variant="sidebar"
              aria-current={item === value ? "page" : undefined}
              className="shrink-0 justify-start @3xl:w-full"
              disabled={disabled}
              onClick={() => onChange(item)}
            >
              <Icon aria-hidden="true" />
              {itemLabel}
              {markedItems?.has(item) && (
                // Decoration only: the unsaved-changes bar and each card footer say it in words.
                <span
                  aria-hidden="true"
                  className="ml-auto size-1.5 shrink-0 rounded-full bg-warning"
                />
              )}
            </Button>
          ))}
        </div>
      ))}
    </nav>
  );
}
