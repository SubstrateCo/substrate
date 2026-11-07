import { useEffect, useRef, useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";

export function CopyButton({
  onCopy,
  label,
  successMessage = "Copied",
  errorMessage = "Couldn't copy",
  size = "xs",
  iconOnly = false,
  className,
}: {
  onCopy: () => void | Promise<void>;
  label: string;
  successMessage?: string;
  errorMessage?: string;
  size?: ComponentProps<typeof Button>["size"];
  iconOnly?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "pending" | "copied" | "error">("idle");
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
      await onCopy();
      setStatus("copied");
    } catch {
      setStatus("error");
    } finally {
      copying.current = false;
    }
  }

  const button = (
    <Button
      type="button"
      size={size}
      variant="ghost"
      className={className}
      aria-label={iconOnly ? label : undefined}
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
      {!iconOnly && label}
    </Button>
  );

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <span role="status" className={status === "error" ? "text-xs text-destructive" : "sr-only"}>
        {status === "error" && errorMessage}
        {copied && successMessage}
      </span>
    </span>
  );
}
