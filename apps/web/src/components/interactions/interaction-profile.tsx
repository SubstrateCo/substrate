import type { InteractionTimeline as TimelineInput } from "@substrate/contracts/context/interactions";

import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { useState, type ReactNode } from "react";

import { RelationshipMap } from "./interaction-connections";
import type { InteractionDays, InteractionScope } from "./interaction-filters";
import { InteractionTimeline } from "./interaction-timeline";
import { ContactLink } from "@/components/contacts/contact-link";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { crmLink } from "@/lib/navigation/record-links";
import { interactionProfileOptions } from "@/queries/context/interactions";
import { ArrowUpRight, List, Network } from "lucide-react";

const profileKinds = {
  person: {
    section: "people",
    back: "Back to people",
    renderOpen: (_organizationId: string, entityId: string) => (
      <ContactLink entityId={entityId}>
        Open contact
        <ArrowUpRight aria-hidden />
      </ContactLink>
    ),
    subject: (entityId: string) => ({ contactEntityId: entityId, accountEntityId: undefined }),
    scoped: false,
  },
  account: {
    section: "accounts",
    back: "Back to organizations",
    renderOpen: (organizationId: string, entityId: string) => (
      <Link {...crmLink(organizationId, "accounts", entityId)}>
        Open in CRM
        <ArrowUpRight aria-hidden />
      </Link>
    ),
    subject: (entityId: string) => ({ contactEntityId: undefined, accountEntityId: entityId }),
    scoped: true,
  },
} as const;

export function InteractionProfile({
  entityId,
  type,
  period,
  tab,
  days,
  onDaysChange,
  createAction,
  onSourceCalendarChange,
}: {
  entityId: string;
  type: "person" | "account";
  period: TimelineInput;
  tab: "activity" | "map";
  days: InteractionDays;
  onDaysChange: (days: InteractionDays) => void;
  createAction?: ReactNode;
  onSourceCalendarChange: (value?: string) => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const profile = useQuery(interactionProfileOptions(organizationId, entityId, type));
  const navigate = useNavigate({ from: "/interactions/" });
  const [scope, setScope] = useState<InteractionScope>("related");
  if (profile.error)
    return (
      <ErrorState
        title="Couldn’t open this profile"
        description="It may be unavailable or you may no longer have access."
        onRetry={() => void profile.refetch()}
      />
    );
  if (!profile.data) return <LoadingState label="Loading interaction profile" />;
  const data = profile.data;
  const kind = profileKinds[type];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="shrink-0 space-y-2">
        <BackLink>
          <Link
            to="/interactions"
            search={(previous) => ({
              ...previous,
              section: kind.section,
              profileId: undefined,
              tab: undefined,
            })}
          >
            {kind.back}
          </Link>
        </BackLink>
        <PageHeader
          title={data.title}
          actions={
            <>
              <Button variant="outline" size="sm" asChild>
                {kind.renderOpen(organizationId, entityId)}
              </Button>
              {createAction}
            </>
          }
        />
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) =>
          void navigate({
            to: "/interactions",
            search: (previous) => ({ ...previous, tab: value === "map" ? "map" : "activity" }),
          })
        }
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-w-0 shrink-0 overflow-x-auto border-b">
          <TabsList variant="line" aria-label="Profile sections">
            <TabsTrigger value="activity">
              <List aria-hidden />
              Activity record
            </TabsTrigger>
            <TabsTrigger value="map">
              <Network aria-hidden />
              Relationship map
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="activity" className="flex min-h-0 flex-col">
          <InteractionTimeline
            key={scope}
            period={{
              ...period,
              ...kind.subject(entityId),
              scope,
            }}
            days={days}
            onDaysChange={onDaysChange}
            scope={kind.scoped ? scope : undefined}
            onScopeChange={setScope}
            onSourceCalendarChange={onSourceCalendarChange}
          />
        </TabsContent>
        <TabsContent value="map" className="flex min-h-0 flex-col">
          <RelationshipMap title={data.title} type={type} connections={data.connections} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
