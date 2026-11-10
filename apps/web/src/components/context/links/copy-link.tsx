import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export function CopyLink({
  href,
  label = "Copy link",
  grouped = false,
}: {
  href: string;
  label?: string;
  grouped?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "pending" | "copied">("idle");
  const toastId = useId();
  const copying = useRef(false);
  const copied = status === "copied";

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setStatus("idle"), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copy() {
    if (copying.current || copied) return;
    copying.current = true;
    setStatus("pending");
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
      toast.dismiss(toastId);
      setStatus("copied");
    } catch {
      setStatus("idle");
      toast.error("Couldn't copy link", { id: toastId });
    } finally {
      copying.current = false;
    }
  }

  const content = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size={grouped ? "icon" : "icon-xs"}
            variant={grouped ? "outline" : "ghost"}
            aria-label={label}
            aria-busy={status === "pending"}
            onClick={() => void copy()}
          >
            <span aria-hidden="true" className="relative inline-grid shrink-0 place-items-center">
              <Copy
                data-copy-icon="copy"
                className={cn(
                  "col-start-1 row-start-1 transition-all duration-200 ease-in-out motion-reduce:transition-none",
                  copied ? "scale-75 opacity-0" : "scale-100 opacity-100",
                )}
              />
              <Check
                data-copy-icon="check"
                className={cn(
                  "col-start-1 row-start-1 transition-all duration-200 ease-in-out motion-reduce:transition-none",
                  copied ? "scale-100 opacity-100" : "scale-75 opacity-0",
                )}
              />
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <span role="status" className="sr-only">
        {copied && "Link copied"}
      </span>
    </>
  );
  return grouped ? (
    content
  ) : (
    <span className="inline-flex min-w-0 items-center gap-2">{content}</span>
  );
}
