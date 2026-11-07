import type { ComponentProps } from "react";

import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";

export function PendingButton({
  pending = false,
  pendingLabel,
  disabled,
  children,
  ...props
}: ComponentProps<typeof Button> & { pending?: boolean; pendingLabel: string }) {
  return (
    <Button {...props} disabled={disabled || pending} aria-busy={pending}>
      {pending && <Spinner aria-hidden="true" role="presentation" />}
      {pending ? pendingLabel : children}
    </Button>
  );
}
