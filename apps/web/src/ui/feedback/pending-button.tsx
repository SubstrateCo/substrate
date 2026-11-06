import type { ComponentProps } from "react";

import { Button } from "../primitives/button";
import { Spinner } from "../primitives/spinner";

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
