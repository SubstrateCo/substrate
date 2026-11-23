import type { InteractionTimeline as TimelineInput } from "@substrate/contracts/context/interactions";

import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { useState } from "react";

import { RelationshipMap } from "./interaction-connections";
import { InteractionTimeline } from "./interaction-timeline";
import { ContactLink } from "@/components/contacts/contact-link";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { crmLink } from "@/lib/navigation/record-links";
import { interactionProfileOptions } from "@/queries/context/interactions";
import { ArrowLeft, ArrowUpRight, List, Network } from "lucide-react";

export function InteractionProfile({
  organizationId,
  entityId,
  type,
  period,
  tab,
}: {
  organizationId: string;
  entityId: string;
  type: "person" | "account";
  period: TimelineInput;
  tab: "activity" | "map";
}) {
  const profile = useQuery(interactionProfileOptions(organizationId, entityId, type));
  const navigate = useNavigate({ from: "/interactions/" });
  const [scope, setScope] = useState<"related" | "linked">("related");
  if (profile.error)
    return (
      <ErrorState
        title="Couldn’t open this profile"
        description="It may be unavailable or you may no longer have access."
        onRetry={() => void profile.refetch()}
      />
    );
  if (!profile.data) return <LoadingState label="Loading interaction profile…" />;
  const data = profile.data;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/interactions"
            search={(previous) => ({
              ...previous,
              section: type === "person" ? "people" : "accounts",
              profileId: undefined,
              tab: undefined,
            })}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            <ArrowLeft aria-hidden className="size-3" />
            {type === "person" ? "People" : "Organizations"}
          </Link>
          <h2 className="text-lg font-semibold">{data.title}</h2>
        </div>
        <Button variant="outline" size="sm" asChild>
          {type === "person" ? (
            <ContactLink entityId={entityId}>
              Open contact
              <ArrowUpRight aria-hidden />
            </ContactLink>
          ) : (
            <Link {...crmLink(organizationId, "accounts", entityId)}>
              Open in CRM
              <ArrowUpRight aria-hidden />
            </Link>
          )}
        </Button>
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
        <TabsContent value="activity" className="flex min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {type === "account" && (
              <div className="shrink-0">
                <SegmentedControl
                  aria-label="Interaction scope"
                  value={scope}
                  onValueChange={setScope}
                  options={[
                    { value: "related", label: "Related contacts" },
                    { value: "linked", label: "Explicit links" },
                  ]}
                />
              </div>
            )}
            <InteractionTimeline
              key={scope}
              period={{
                ...period,
                contactEntityId: type === "person" ? entityId : undefined,
                accountEntityId: type === "account" ? entityId : undefined,
                scope,
              }}
            />
          </div>
        </TabsContent>
        <TabsContent value="map" className="flex min-h-0 flex-col">
          <RelationshipMap
            organizationId={organizationId}
            title={data.title}
            type={type}
            connections={data.connections}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
