import type { MeetingScope } from "@substrate/contracts/meetings";
import { providerNames } from "@substrate/contracts/meetings";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";

import { useMeetingsWorkspace } from "../meetings-workspace-context";
import { OriginalText } from "./original-text";
import { isAccessFailure } from "@/api/access-failure";
import { decideMatch } from "@/api/meetings/requests";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { FormMessage } from "@/components/feedback/form-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { Property, PropertyList } from "@/components/layout/record-section";
import { ProviderMark } from "@/components/meetings/sources/meeting-provider";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Item, ItemActions, ItemContent, ItemHeader, ItemMedia } from "@/components/ui/item";
import { formatArchiveDate, formatWallTime, parseDateOnly } from "@/lib/format/date";
import { peopleLabels } from "@/lib/meetings/display";
import { GitMerge } from "lucide-react";

export function MatchReview({ scope }: { scope: MeetingScope }) {
  const { queries } = useMeetingsWorkspace();
  const query = useQuery(queries.reviews),
    client = useQueryClient();
  const [inspect, setInspect] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: (v: { id: string; candidateId: string; combine: boolean }) =>
      decideMatch(scope, v.id, v.candidateId, v.combine),
    onSuccess: () => void client.invalidateQueries({ queryKey: queries.root }),
  });
  if (isAccessFailure(query.error)) return <ContentNotice title="Match review unavailable" />;
  if (query.error)
    return (
      <ErrorState title="Couldn’t load possible matches" onRetry={() => void query.refetch()} />
    );
  if (!query.data) return <LoadingState label="Loading matches" />;
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <PageHeader
        title="Match review"
        description="Decide whether two records describe the same meeting."
      />
      <FormMessage error={act.error} errorDescription="This decision could not be saved." />
      {!query.data.length && (
        <ContentNotice
          icon={GitMerge}
          title="No matches to review"
          description="Uncertain matches will appear here."
        />
      )}
      {query.data.map((r) => (
        <section
          key={r.originalId}
          className="space-y-3 not-first-of-type:border-t not-first-of-type:pt-5"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { label: "In your archive", ...r.candidate },
              {
                label: "Incoming source",
                title: r.title,
                localStart: r.localStart,
                people: r.people,
                providers: [r.provider],
              },
            ].map((v) => (
              <Item key={v.label} variant="outline" className="content-start">
                <ItemHeader>
                  <span className="text-xs font-medium text-muted-foreground">{v.label}</span>
                  <ItemMedia>
                    {v.providers.map((p) => (
                      <ProviderMark key={p} provider={p} />
                    ))}
                  </ItemMedia>
                </ItemHeader>
                <ItemContent className="min-w-0 basis-full">
                  <Heading level={2} variant="section" className="wrap-anywhere">
                    {v.title}
                  </Heading>
                  <p className="text-xs text-muted-foreground">
                    {v.providers.map((p) => providerNames[p]).join(", ")}
                  </p>
                  <PropertyList className="mt-3">
                    <Property label="Date">
                      {formatArchiveDate(parseDateOnly(v.localStart.slice(0, 10))!)}
                    </Property>
                    <Property label="Time">{formatWallTime(v.localStart)}</Property>
                    <Property label="People">
                      {peopleLabels(v.people).join(", ") || "Not supplied"}
                    </Property>
                  </PropertyList>
                </ItemContent>
              </Item>
            ))}
          </div>
          <Item variant="muted">
            <ItemMedia variant="icon">
              <GitMerge aria-hidden className="text-warning-text" />
            </ItemMedia>
            <ItemContent className="min-w-0 basis-56">
              <Heading level={3}>Possible match</Heading>
              <p className="text-xs text-muted-foreground">
                Compare the incoming record with the archived call before combining their sources.
              </p>
            </ItemContent>
            <ItemActions>
              <Button
                variant="outline"
                size="sm"
                aria-expanded={inspect === r.originalId}
                onClick={() => setInspect(inspect === r.originalId ? null : r.originalId)}
              >
                Inspect incoming original
              </Button>
            </ItemActions>
          </Item>
          {inspect === r.originalId && <OriginalText id={r.originalId} />}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={act.isPending}
              onClick={() =>
                act.mutate({ id: r.originalId, candidateId: r.candidate.id, combine: false })
              }
            >
              Keep as separate meeting
            </Button>
            <Button
              disabled={act.isPending}
              onClick={() =>
                act.mutate({ id: r.originalId, candidateId: r.candidate.id, combine: true })
              }
            >
              <GitMerge />
              Combine sources
            </Button>
          </div>
        </section>
      ))}
    </div>
  );
}
