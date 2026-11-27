import { useId, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ChevronRight } from "lucide-react";

/**
 * A skills or MCP servers page in the settings sheet: a toolbar, then its lists. The
 * sheet header names the page, so it has no title of its own.
 */
export function ConfigurationPage({
  toolbar,
  children,
}: {
  toolbar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
      {children}
    </div>
  );
}

export function ConfigurationSearch({
  label,
  count,
  value,
  onChange,
}: {
  label: string;
  count: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      type="search"
      aria-label={`Search ${label}`}
      placeholder={`Search ${count} ${label}`}
      className="min-w-0 flex-1 basis-40"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** What Substrate adds on its own. Folded by default: the owner can't change it. */
export function BuiltInGroup({
  title,
  count,
  actions,
  children,
}: {
  title: string;
  count: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Collapsible asChild>
      <div className="group/builtin border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="disclosure" size="xs" aria-controls={id}>
              {title}
              <span className="tabular-nums">{count}</span>
              <ChevronRight
                aria-hidden="true"
                className="transition-transform duration-150 ease-out group-data-[state=open]/builtin:rotate-90 motion-reduce:transition-none"
              />
            </Button>
          </CollapsibleTrigger>
          {actions}
        </div>
        <CollapsibleContent id={id}>
          <div className="mt-2 grid min-w-0 gap-2">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
