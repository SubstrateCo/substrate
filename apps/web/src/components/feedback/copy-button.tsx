import { useEffect, useId, useRef, useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export function CopyButton({
  onCopy,
  label,
  successMessage = "Copied",
  errorMessage = "Couldn't copy",
  size = "xs",
  iconOnly = false,
  className,
  grouped = false,
}: {
  onCopy: () => void | Promise<void>;
  label: string;
  successMessage?: string;
  errorMessage?: string;
  size?: ComponentProps<typeof Button>["size"];
  iconOnly?: boolean;
  className?: string;
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
      await onCopy();
      toast.dismiss(toastId);
      setStatus("copied");
    } catch {
      setStatus("idle");
      toast.error(errorMessage, { id: toastId });
    } finally {
      copying.current = false;
    }
  }

  const button = (
    <Button
      type="button"
      size={size}
      variant={grouped ? "outline" : "ghost"}
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

  const content = (
    <>
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <span role="status" className="sr-only">
        {copied && successMessage}
      </span>
    </>
  );
  return grouped ? (
    content
  ) : (
    <span className="inline-flex min-w-0 items-center gap-2">{content}</span>
  );
}
