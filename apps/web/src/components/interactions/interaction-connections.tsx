import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { InteractionRecordLink } from "./interaction-link";
import type { getInteractionProfile } from "@/api/context/interactions";
import { ContentNotice } from "@/components/feedback/content-notice";
import { recordRows } from "@/components/layout/record-section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { eventDate } from "@/lib/calendar/days";
import { calendarLink, linkedWorkLink } from "@/lib/navigation/record-links";
import { calendarEventOptions } from "@/queries/calendar/options";
import { ArrowRight, Building2, CalendarDays, Link2, UserRound } from "lucide-react";

export type InteractionConnection = Awaited<
  ReturnType<typeof getInteractionProfile>
>["connections"][number];

function ConnectionLink({ connection }: { connection: InteractionConnection }) {
  const { organizationId } = useWorkspaceScope();
  const apps = useOrganizationApps();
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
          // The linked record can be older than the current period.
          days: "all",
        })}
        className="min-w-0 font-medium wrap-anywhere underline-offset-4 hover:underline"
      >
        {connection.title}
      </Link>
    );
  if (connection.entityType === "calendar_event") return <MeetingLink connection={connection} />;
  if (connection.entityType === "contact_interaction")
    return (
      <InteractionRecordLink
        entityId={connection.entityId}
        className="min-w-0 wrap-anywhere underline underline-offset-4"
      >
        {connection.title}
      </InteractionRecordLink>
    );
  return (
    <Link
      {...linkedWorkLink(organizationId, connection, apps.enabled("crm"))}
      className="min-w-0 wrap-anywhere underline underline-offset-4"
    >
      {connection.title}
    </Link>
  );
}

/** A linked meeting opens on its day. The event read is the one the calendar pane reuses. */
function MeetingLink({ connection }: { connection: InteractionConnection }) {
  const { organizationId } = useWorkspaceScope();
  const event = useQuery(calendarEventOptions(organizationId, connection.entityId)).data;
  const date = event ? eventDate(event) : undefined;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <CalendarDays aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <Link
        {...calendarLink(organizationId, connection.entityId, date)}
        className="truncate underline underline-offset-4"
      >
        {connection.title}
      </Link>
    </span>
  );
}

export function InteractionConnections({ connections }: { connections: InteractionConnection[] }) {
  if (!connections.length)
    return <ContentNotice variant="inline" title="No linked records you can access" />;
  return (
    <ul className={recordRows}>
      {connections.map((connection) => (
        <li
          key={`${connection.entityType}:${connection.entityId}`}
          className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 py-1.5 text-sm"
        >
          <ConnectionLink connection={connection} />
          <span className="text-xs wrap-anywhere text-muted-foreground">{connection.relation}</span>
        </li>
      ))}
    </ul>
  );
}

export function RelationshipMap({
  title,
  type,
  connections,
}: {
  title: string;
  type: "person" | "account";
  connections: InteractionConnection[];
}) {
  const Icon = type === "person" ? UserRound : Building2;
  return (
    <Card size="sm" role="region" aria-label="Relationship map" className="min-h-0 min-w-0 flex-1">
      <CardHeader>
        <CardTitle>
          <Heading level={2} variant="inherit">
            Relationship map
          </Heading>
        </CardTitle>
        <CardDescription>
          Saved affiliations and explicit record links. Names in summaries do not establish a
          relationship.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col items-start gap-4 overflow-y-auto @2xl:flex-row">
        <div className="flex max-w-full items-center gap-2 rounded-lg border bg-card p-4 text-sm font-medium wrap-anywhere @2xl:max-w-1/2">
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          {title}
        </div>
        <ArrowRight
          aria-hidden
          className="size-4 shrink-0 rotate-90 self-center text-muted-foreground @2xl:mt-4 @2xl:rotate-0 @2xl:self-start"
        />
        <ul className="w-full min-w-0 space-y-2 @2xl:w-auto @2xl:flex-1">
          {connections.map((connection) => (
            <li
              key={connection.entityId}
              className="space-y-1 rounded-lg border bg-card px-4 py-3 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Link2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                <ConnectionLink connection={connection} />
              </div>
              <p className="text-xs wrap-anywhere text-muted-foreground">{connection.relation}</p>
            </li>
          ))}
          {!connections.length && (
            <li>
              <ContentNotice variant="inline" title="No saved connections you can access" />
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
