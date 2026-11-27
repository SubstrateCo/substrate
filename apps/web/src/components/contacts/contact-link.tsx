import { Link } from "@tanstack/react-router";

import type { ComponentProps } from "react";

/** Open contact details without leaving the current workspace app. */
export function ContactLink({
  entityId,
  ...props
}: {
  entityId: string;
} & ComponentProps<"a">) {
  return (
    <Link
      to="."
      search={(previous) => ({ ...previous, contactId: entityId })}
      resetScroll={false}
      {...props}
    />
  );
}
