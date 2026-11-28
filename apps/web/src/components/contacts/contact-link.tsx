import { Link } from "@tanstack/react-router";

import type { ComponentProps } from "react";

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
