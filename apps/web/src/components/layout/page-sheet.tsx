import {
  createContext,
  useContext,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "cn";
import { X } from "lucide-react";

const PageSheetContext = createContext<{ onClose: () => void; label: string } | null>(null);
export const PageSheetSuspendedContext = createContext(false);

export function usePageSheet() {
  return useContext(PageSheetContext);
}

/** Temporary record details. Keep this mounted beside PageContent so exit motion can finish. */
export function PageSheet({
  open: requestedOpen,
  onOpenChange,
  label,
  children,
  ref,
  onFocusCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  children: ReactNode;
  ref?: ComponentProps<typeof SheetContent>["ref"];
  onFocusCapture?: ComponentProps<typeof SheetContent>["onFocusCapture"];
}) {
  const suspended = useContext(PageSheetSuspendedContext);
  const open = requestedOpen && !suspended;
  const wide = useMediaQuery("(min-width: 1024px)");
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [previous, setPrevious] = useState(children);
  if (open && previous !== children) setPrevious(children);
  const opener = useRef<Element | null>(null);
  const outside = useRef(false);
  return (
    <PageSheetContext.Provider value={{ onClose: () => onOpenChange(false), label }}>
      <div ref={setContainer} className="pointer-events-none absolute inset-0 z-20" />
      {container && (
        <Sheet open={open} onOpenChange={onOpenChange} modal={!wide}>
          <SheetContent
            ref={ref}
            container={container}
            showCloseButton={false}
            aria-describedby={undefined}
            aria-modal={!wide || undefined}
            className="@container w-full max-sm:overflow-hidden lg:w-xl lg:max-w-full"
            onFocusCapture={onFocusCapture}
            onOpenAutoFocus={(event) => {
              opener.current = document.activeElement;
              outside.current = false;
              event.preventDefault();
              container
                .querySelector<HTMLElement>('[data-slot="sheet-content"]')
                ?.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (suspended || outside.current) return;
              if (opener.current instanceof HTMLElement && opener.current.isConnected)
                opener.current.focus({ preventScroll: true });
            }}
            onInteractOutside={(event) => {
              if (event.detail.originalEvent.type === "focusin") {
                event.preventDefault();
                return;
              }
              const target = event.target;
              if (
                target instanceof Element &&
                target.closest("button, a, input, textarea, select, label, [role=tab]")
              ) {
                event.preventDefault();
                return;
              }
              outside.current = true;
            }}
          >
            <SheetTitle className="sr-only">{label}</SheetTitle>
            {open ? children : previous}
          </SheetContent>
        </Sheet>
      )}
    </PageSheetContext.Provider>
  );
}

export function PageSheetHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  const sheet = usePageSheet();
  return (
    <PageHeader
      variant="pane"
      title={title}
      actions={
        <div
          role="group"
          aria-label={`${sheet?.label ?? "Record"} actions`}
          className="flex items-center gap-0.5 max-sm:[&_button]:size-11"
        >
          {actions}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Close ${sheet?.label.toLowerCase() ?? "record"}`}
                onClick={sheet?.onClose}
              >
                <X aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close {sheet?.label.toLowerCase() ?? "record"}</TooltipContent>
          </Tooltip>
        </div>
      }
    />
  );
}

export function PageSheetBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5",
        className,
      )}
      {...props}
    />
  );
}
