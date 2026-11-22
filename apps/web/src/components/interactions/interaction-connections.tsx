import { Link } from "@tanstack/react-router";

import type { getInteractionProfile } from "@/api/context/interactions";
import { linkedWorkLink } from "@/lib/navigation/record-links";
import { ArrowRight, Building2, Link2, UserRound } from "lucide-react";

export type InteractionConnection = Awaited<
  ReturnType<typeof getInteractionProfile>
>["connections"][number];

function ConnectionLink({
  organizationId,
  connection,
}: {
  organizationId: string;
  connection: InteractionConnection;
}) {
  if (connection.entityType === "contact" || connection.entityType === "account")
    return (
      <Link
        to="/interactions"
        search={(previous) => ({
          ...previous,
          workspaceId: organizationId,
          section: connection.entityType === "contact" ? "person" : "account",
          profileId: connection.entityId,
          recordId: undefined,
          tab: undefined,
        })}
        className="font-medium underline-offset-4 hover:underline"
      >
        {connection.title}
      </Link>
    );
  if (connection.entityType === "contact_interaction")
    return (
      <Link
        from="/interactions/"
        to="/interactions"
        search={(previous) => ({
          ...previous,
          workspaceId: organizationId,
          recordId: connection.entityId,
        })}
        className="underline underline-offset-4"
      >
        {connection.title}
      </Link>
    );
  return (
    <Link {...linkedWorkLink(organizationId, connection)} className="underline underline-offset-4">
      {connection.title}
    </Link>
  );
}

export function InteractionConnections({
  organizationId,
  connections,
}: {
  organizationId: string;
  connections: InteractionConnection[];
}) {
  if (!connections.length)
    return <p className="text-sm text-muted-foreground">No linked records you can access</p>;
  return (
    <ul className="divide-y">
      {connections.map((connection) => (
        <li
          key={`${connection.entityType}:${connection.entityId}`}
          className="flex items-center justify-between gap-3 py-2 text-sm"
        >
          <ConnectionLink organizationId={organizationId} connection={connection} />
          <span className="text-xs text-muted-foreground">{connection.relation}</span>
        </li>
      ))}
    </ul>
  );
}

export function RelationshipMap({
  organizationId,
  title,
  type,
  connections,
}: {
  organizationId: string;
  title: string;
  type: "person" | "account";
  connections: InteractionConnection[];
}) {
  const Icon = type === "person" ? UserRound : Building2;
  return (
    <section
      aria-label="Relationship map"
      className="min-h-0 flex-1 overflow-y-auto rounded-lg border p-5"
    >
      <div className="mb-5 space-y-1">
        <h2 className="text-sm font-medium">Relationship map</h2>
        <p className="text-xs text-muted-foreground">
          Saved affiliations and explicit record links. Names in summaries do not establish a
          relationship.
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm font-medium">
          <Icon aria-hidden className="size-4 text-muted-foreground" />
          {title}
        </div>
        <ArrowRight aria-hidden className="mt-4 size-4 text-muted-foreground" />
        <ul className="min-w-0 flex-1 space-y-2">
          {connections.map((connection) => (
            <li
              key={connection.entityId}
              className="space-y-1 rounded-lg border bg-card px-4 py-3 text-sm"
            >
              <div className="flex items-center gap-2">
                <Link2 aria-hidden className="size-3.5 text-muted-foreground" />
                <ConnectionLink organizationId={organizationId} connection={connection} />
              </div>
              <p className="text-xs text-muted-foreground">{connection.relation}</p>
            </li>
          ))}
          {!connections.length && (
            <li className="text-sm text-muted-foreground">No saved connections you can access</li>
          )}
        </ul>
      </div>
    </section>
  );
}
