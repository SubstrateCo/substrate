import { createContext, useContext, useId, type ComponentType, type ReactNode } from "react";

import { toneBorder, toneFill } from "@/components/feedback/tag-styles";
import { enterMotion } from "@/components/motion/motion";
import { Heading } from "@/components/ui/heading";
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
  arriving = false,
  children,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: ReactNode;
  meta?: ReactNode;
  tone?: Tone;
  /** The card arrived while the person watched, so it fades in. */
  arriving?: boolean;
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    <ToneContext.Provider value={tone}>
      <section
        aria-labelledby={titleId}
        data-slot="message-card"
        className={cn(
          "@container mt-2.5 w-full max-w-180 overflow-hidden rounded-lg border bg-card text-card-foreground [&+&]:mt-2",
          tone === "attention" && toneBorder.warning,
          arriving && enterMotion.fade,
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
          <div className="flex min-w-0 flex-1 flex-col gap-1 @sm:flex-row @sm:items-center @sm:gap-2.5">
            <Heading level={3} id={titleId} className="min-w-0 wrap-anywhere">
              {title}
            </Heading>
            {meta && (
              <span className="min-w-0 truncate text-xs text-muted-foreground tabular-nums">
                {meta}
              </span>
            )}
          </div>
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
