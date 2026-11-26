import type { InteractionTimeline as TimelineInput } from "@substrate/contracts/context/interactions";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useState, type ReactNode } from "react";

import { InteractionList } from "./interaction-list";
import { interactionKinds, interactionOrigins, interactionTypes } from "./interaction-types";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Pager, useCursorPages } from "@/components/table";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { useInteractionSources } from "@/queries/calendar/interaction-sources";
import { interactionTimelineOptions } from "@/queries/context/interactions";
import { Activity } from "lucide-react";

type Cursor = Pick<TimelineInput, "beforeOccurredAt" | "beforeEntityId">;

export function InteractionTimeline({
  period,
  filters,
}: {
  period: TimelineInput;
  /** Filters right after the search, such as the activity period. */
  filters?: ReactNode;
}) {
  const apps = useOrganizationApps();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [origin, setOrigin] = useState("all");
  const debounced = useSearchDebounce(search, `${kind}:${origin}`);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Search interactions"
          placeholder="Search contacts or summaries"
          className="w-72 max-w-full"
          value={search}
          maxLength={200}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filters}
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger aria-label="Interaction type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {interactionKinds.map((k) => (
              <SelectItem key={k} value={k}>
                {interactionTypes[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={origin} onValueChange={setOrigin}>
          <SelectTrigger aria-label="Record origin">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All origins</SelectItem>
            <SelectItem value="manual">Logged manually</SelectItem>
            <SelectItem value="message_publication">Published from message</SelectItem>
            {apps.enabled("calendar") && (
              <SelectItem value="calendar_event">
                {interactionOrigins.calendar_event.long}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      <TimelinePage
        // Each period and filter pages from its own start: a cursor from another one would
        // skip that list's newest interactions.
        key={JSON.stringify([period, debounced.query, kind, origin])}
        period={period}
        search={debounced.query}
        kind={kind}
        origin={origin}
        pending={debounced.pending}
      />
    </div>
  );
}

function TimelinePage({
  period,
  search,
  kind,
  origin,
  pending,
}: {
  period: TimelineInput;
  search: string;
  kind: string;
  origin: string;
  pending: boolean;
}) {
  const pages = useCursorPages<Cursor>();
  const input: TimelineInput = {
    ...period,
    search,
    kind: interactionKinds.find((k) => k === kind),
    origin: (["manual", "message_publication", "calendar_event"] as const).find(
      (value) => value === origin,
    ),
    ...pages.cursor,
  };
  const apps = useOrganizationApps();
  // The view remounts for each filter, so a placeholder here is always the previous page.
  const query = useQuery({
    ...interactionTimelineOptions(input),
    enabled: !pending,
    placeholderData: keepPreviousData,
  });
  const sources = useInteractionSources(
    period.organizationId,
    query.data?.items ?? [],
    apps.enabled("calendar"),
  );
  if (query.error)
    return <ErrorState title="Couldn’t load interactions" onRetry={() => void query.refetch()} />;
  if (!query.data) return <LoadingState label="Loading interactions" rows={5} />;
  const { items, nextCursor } = query.data;
  const filtered = search || kind !== "all" || origin !== "all";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Card size="sm" className="min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.length ? (
            <InteractionList
              rows={items}
              organizationId={period.organizationId}
              sources={sources}
            />
          ) : (
            <ContentNotice
              title={filtered ? "No matching interactions" : "No interactions in this period"}
              icon={Activity}
              description={
                filtered
                  ? "Try another search, type, or origin."
                  : "Interactions logged on contacts or published from messages will appear here."
              }
            />
          )}
        </div>
      </Card>
      {(pages.pageIndex > 0 || nextCursor) && (
        <Pager
          name="Interactions"
          pageIndex={pages.pageIndex}
          pageCount={-1}
          canPrevious={pages.pageIndex > 0}
          canNext={Boolean(nextCursor)}
          onPageChange={(pageIndex) => {
            if (pageIndex < pages.pageIndex) pages.previous();
            else if (nextCursor) pages.next(nextCursor);
          }}
        />
      )}
    </div>
  );
}
