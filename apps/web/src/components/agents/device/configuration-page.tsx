import { useId, type ReactNode } from "react";

import { GroupTitle } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ChevronRight } from "lucide-react";

export function ConfigurationPage({
  toolbar,
  children,
}: {
  toolbar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-8">
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

export function ConfigurationList({
  title,
  description,
  label,
  hidden,
  children,
}: {
  title?: string;
  description?: string;
  label?: string;
  hidden?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-3">
      {title && <GroupTitle id={`${id}-title`} title={title} description={description} />}
      <ul
        aria-label={label}
        aria-labelledby={title ? `${id}-title` : undefined}
        aria-hidden={hidden || undefined}
        className="grid divide-y border-y"
      >
        {children}
      </ul>
    </div>
  );
}

export function BuiltInGroup({
  title,
  description,
  count,
  noun,
  actions,
  children,
}: {
  title: string;
  description: string;
  count: number;
  noun: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  const items = `${count} ${count === 1 ? noun : `${noun}s`}`;
  return (
    <section aria-labelledby={`${id}-title`} className="grid min-w-0 gap-3">
      <GroupTitle id={`${id}-title`} title={title} description={description} actions={actions} />
      <Collapsible asChild>
        <div className="group/builtin grid min-w-0 gap-3">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="disclosure"
              size="xs"
              className="-ml-2 justify-self-start"
              aria-controls={id}
            >
              <ChevronRight
                aria-hidden="true"
                className="transition-transform duration-150 ease-out group-data-[state=open]/builtin:rotate-90 motion-reduce:transition-none"
              />
              <span className="group-data-[state=open]/builtin:hidden">Show {items}</span>
              <span className="hidden group-data-[state=open]/builtin:inline">Hide {items}</span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent id={id}>{children}</CollapsibleContent>
        </div>
      </Collapsible>
    </section>
  );
}
