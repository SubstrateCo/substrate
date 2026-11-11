import { useMutation } from "@tanstack/react-query";

import { useId, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "cn";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export function CopyButton({
  onCopy,
  label,
  successMessage = "Copied",
  errorMessage = "Couldn’t copy",
  size = "xs",
  className,
  grouped = false,
}: {
  onCopy: () => void | Promise<void>;
  label: string;
  successMessage?: string;
  errorMessage?: string;
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
  grouped?: boolean;
}) {
  const toastId = useId();
  const copy = useMutation({
    mutationFn: async () => onCopy(),
    onSuccess: () => toast.dismiss(toastId),
    onError: () => toast.error(errorMessage, { id: toastId }),
  });
  const copied = copy.isSuccess;

  const button = (
    <Button
      type="button"
      size={size}
      variant="ghost"
      className={className}
      aria-label={label}
      aria-busy={copy.isPending}
      onClick={() => {
        if (copy.isPending || copied) return;
        // The check mark shows briefly, then the button can copy again.
        copy.mutate(undefined, { onSuccess: () => window.setTimeout(copy.reset, 1500) });
      }}
    >
      <span aria-hidden="true" className="relative inline-grid shrink-0 place-items-center">
        <Copy
          data-copy-icon="copy"
          className={cn(
            "col-start-1 row-start-1 transition duration-150 ease-out motion-reduce:transition-none",
            copied ? "scale-75 opacity-0" : "scale-100 opacity-100",
          )}
        />
        <Check
          data-copy-icon="check"
          className={cn(
            "col-start-1 row-start-1 transition duration-150 ease-out motion-reduce:transition-none",
            copied ? "scale-100 opacity-100" : "scale-75 opacity-0",
          )}
        />
      </span>
    </Button>
  );

  const content = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
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
