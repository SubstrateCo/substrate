import { Children, cloneElement, isValidElement, type ComponentProps, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "cn";

export function PendingButton({
  pending = false,
  disabled,
  className,
  children,
  ...props
}: ComponentProps<typeof Button> & { pending?: boolean }) {
  const [first, ...rest] = Children.toArray(children);
  // oxlint-disable-next-line deslop/no-runtime-typeof -- A React element type is a tag name or a component.
  const leadingIcon = isValidElement(first) && typeof first.type !== "string";
  const overlay = pending && !leadingIcon;
  let content: ReactNode = children;
  if (pending && leadingIcon)
    content = [
      <Spinner key="spinner" aria-hidden="true" role="presentation" data-icon="inline-start" />,
      ...rest,
    ];
  else if (overlay)
    content = [
      ...Children.toArray(children).map(hide),
      <Spinner
        key="spinner"
        aria-hidden="true"
        role="presentation"
        className="absolute inset-0 m-auto"
      />,
    ];
  return (
    <Button
      {...props}
      className={cn(overlay && "relative", className)}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {content}
    </Button>
  );
}

function hide(child: ReturnType<typeof Children.toArray>[number], index: number) {
  if (isValidElement<{ className?: string }>(child))
    return cloneElement(child, {
      className: cn(child.props.className, "opacity-0"),
    });
  return (
    <span key={`text-${index}`} className="opacity-0">
      {child}
    </span>
  );
}
