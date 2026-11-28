import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";

export function InteractionLink({
  entityId,
  children,
  className,
  "aria-label": label,
}: {
  entityId: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Link
      to="."
      search={(previous) => ({ ...previous, interactionId: entityId })}
      resetScroll={false}
      className={className}
      aria-label={label}
    >
      {children}
    </Link>
  );
}

type InteractionsLinkProps = {
  children: ReactNode;
  className?: string;
  title?: string;
  "aria-label"?: string;
};

export function InteractionRecordLink({
  entityId,
  ...props
}: InteractionsLinkProps & { entityId: string }) {
  const { organizationId } = useWorkspaceScope();
  return (
    <Link
      from="/interactions/"
      to="/interactions"
      search={(previous) => ({ ...previous, workspaceId: organizationId, recordId: entityId })}
      resetScroll={false}
      {...props}
    />
  );
}

export function ContactProfileLink({
  contactEntityId,
  allTime,
  ...props
}: InteractionsLinkProps & {
  contactEntityId: string;
  allTime?: boolean;
}) {
  const { organizationId } = useWorkspaceScope();
  return (
    <Link
      from="/interactions/"
      to="/interactions"
      search={(previous) => ({
        ...previous,
        workspaceId: organizationId,
        section: "person",
        profileId: contactEntityId,
        recordId: undefined,
        days: allTime ? "all" : previous.days,
      })}
      {...props}
    />
  );
}
