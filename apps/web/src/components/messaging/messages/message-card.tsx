import { createContext, useContext, useId, type ComponentType, type ReactNode } from "react";

import { toneBorder, toneFill } from "@/components/feedback/tag";
import { cn } from "cn";

type Tone = "default" | "attention";

const ToneContext = createContext<Tone>("default");

/**
 * The shared shell for cards attached under a message, such as agent requests. Every card has the
 * same width and header.
 */
export function MessageCard({
  icon: Icon,
  title,
  meta,
  tone = "default",
  children,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: ReactNode;
  meta?: ReactNode;
  tone?: Tone;
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    <ToneContext.Provider value={tone}>
      <section
        aria-labelledby={titleId}
        data-slot="message-card"
        className={cn(
          "mt-2.5 w-full max-w-180 overflow-hidden rounded-lg border bg-card text-card-foreground [&+&]:mt-2",
          tone === "attention" && toneBorder.warning,
        )}
      >
        <header
          className={cn(
            "flex min-h-10 min-w-0 items-center gap-2.5 py-1.5 pr-1.5 pl-3",
            tone === "attention" && toneFill.warning,
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
            <span className="min-w-0 truncate text-xs text-muted-foreground tabular-nums">
              {meta}
            </span>
          )}
        </header>
        {children}
      </section>
    </ToneContext.Provider>
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
        tone === "attention" && toneBorder.warning,
        className,
      )}
    >
      {children}
    </div>
  );
}
