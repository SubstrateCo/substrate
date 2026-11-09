import {
  createContext,
  useContext,
  useId,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

import { Button } from "../../ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { cn } from "cn";
import { ChevronDown } from "lucide-react";

type Tone = "default" | "attention";

const ToneContext = createContext<Tone>("default");

/**
 * The shared shell for anything attached under a message: linked work, agent requests, and
 * other records. Every card has the same width, header, and row size. Pass `collapsible` to let
 * people fold the rows away; the header stays visible.
 */
export function MessageCard({
  icon: Icon,
  title,
  meta,
  actions,
  tone = "default",
  collapsible = false,
  defaultOpen = true,
  children,
  className,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  tone?: Tone;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const titleId = useId();
  const header = (
    <header
      className={cn(
        "flex min-h-10 min-w-0 items-center gap-2.5 py-1.5 pr-1.5 pl-3",
        tone === "attention" && "bg-warning/10",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          tone === "attention" ? "text-warning" : "text-muted-foreground",
        )}
      />
      <h3 id={titleId} className="shrink-0 text-sm font-semibold">
        {title}
      </h3>
      {meta && (
        <span className="min-w-0 truncate text-xs text-muted-foreground tabular-nums">{meta}</span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        {actions}
        {collapsible && (
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={open ? "Collapse" : "Expand"}
            >
              <ChevronDown
                aria-hidden="true"
                className={cn("transition-transform", !open && "-rotate-90")}
              />
            </Button>
          </CollapsibleTrigger>
        )}
      </span>
    </header>
  );
  const shell = cn(
    "mt-2.5 w-full max-w-180 overflow-hidden rounded-lg border bg-card text-card-foreground [&+&]:mt-2",
    tone === "attention" && "border-warning/50",
    className,
  );
  if (!collapsible)
    return (
      <ToneContext.Provider value={tone}>
        <section aria-labelledby={titleId} data-slot="message-card" className={shell}>
          {header}
          {children}
        </section>
      </ToneContext.Provider>
    );
  return (
    <ToneContext.Provider value={tone}>
      <Collapsible asChild open={open} onOpenChange={setOpen}>
        <section aria-labelledby={titleId} data-slot="message-card" className={shell}>
          {header}
          <CollapsibleContent>{children}</CollapsibleContent>
        </section>
      </Collapsible>
    </ToneContext.Provider>
  );
}

/** Rows divide themselves from the header and from each other. */
export function MessageCardRows({ children }: { children: ReactNode }) {
  return <ul className="min-w-0">{children}</ul>;
}

export function MessageCardRow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const tone = useContext(ToneContext);
  return (
    <li
      className={cn(
        "flex min-h-10 min-w-0 items-center gap-2.5 border-t px-3 py-1 text-sm",
        tone === "attention" && "border-warning/30",
        className,
      )}
    >
      {children}
    </li>
  );
}

export function MessageCardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const tone = useContext(ToneContext);
  return (
    <div
      className={cn(
        "grid min-w-0 gap-2.5 border-t p-3 text-sm",
        tone === "attention" && "border-warning/30",
        className,
      )}
    >
      {children}
    </div>
  );
}
