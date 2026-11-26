import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";

/** Open interaction details without leaving the current workspace app. */
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

/** Inside Interactions: open one interaction's record sheet and keep the current view. */
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
      {...props}
    />
  );
}

/** Inside Interactions: open a contact's profile, keep the current filters, and close any record. */
export function ContactProfileLink({
  contactEntityId,
  allTime,
  ...props
}: InteractionsLinkProps & {
  contactEntityId: string;
  /** Show all time, for a record that can be older than the current period. */
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
