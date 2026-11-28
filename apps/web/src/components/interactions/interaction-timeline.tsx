import type {
  InteractionKind,
  InteractionTimeline as TimelineInput,
} from "@substrate/contracts/context/interactions";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useState } from "react";

import {
  loggedByField,
  originField,
  periodField,
  scopeField,
  typeField,
} from "./interaction-filter-fields";
import {
  interactionFiltersFrom,
  interactionFilterValue,
  type InteractionDays,
  type InteractionFilters,
  type InteractionLoggedBy,
  type InteractionOrigin,
  type InteractionScope,
} from "./interaction-filters";
import { InteractionList } from "./interaction-list";
import { OwnInteractionsNotice } from "./own-interactions-notice";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { FilterBar } from "@/components/filters";
import { Pager, useCursorPages } from "@/components/table";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { useInteractionSources } from "@/queries/calendar/interaction-sources";
import { interactionTimelineOptions } from "@/queries/context/interactions";
import { Activity } from "lucide-react";

type Cursor = Pick<TimelineInput, "beforeOccurredAt" | "beforeEntityId">;

export function InteractionTimeline({
  period,
  days,
  onDaysChange,
  scope,
  onScopeChange,
  loggedBy,
  onLoggedByChange,
}: {
  period: TimelineInput;
  days: InteractionDays;
  onDaysChange: (days: InteractionDays) => void;
  scope?: InteractionScope;
  onScopeChange?: (scope: InteractionScope) => void;
  loggedBy?: InteractionLoggedBy;
  onLoggedByChange?: (loggedBy: InteractionLoggedBy) => void;
}) {
  const apps = useOrganizationApps();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<InteractionKind>();
  const [origin, setOrigin] = useState<InteractionOrigin>();
  const debounced = useSearchDebounce(search, `${kind}:${origin}`);
  const filters: InteractionFilters = { days, loggedBy, kind, origin, scope };
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
        <FilterBar
          aria-label="Interaction filters"
          fields={[
            periodField({ allTime: true }),
            ...(loggedBy ? [loggedByField] : []),
            typeField,
            originField({ calendar: apps.enabled("calendar") }),
            ...(scope ? [scopeField] : []),
          ]}
          value={interactionFilterValue(filters)}
          onValueChange={(value) => {
            const next = interactionFiltersFrom(value, filters);
            setKind(next.kind);
            setOrigin(next.origin);
            if (next.days !== days) onDaysChange(next.days);
            if (next.scope && next.scope !== scope) onScopeChange?.(next.scope);
            if (next.loggedBy && next.loggedBy !== loggedBy) onLoggedByChange?.(next.loggedBy);
          }}
        />
      </div>
      <TimelinePage
        key={JSON.stringify([period, debounced.query, kind, origin])}
        period={period}
        search={debounced.query}
        kind={kind}
        origin={origin}
        pending={debounced.pending}
        onShowEveryone={onLoggedByChange && (() => onLoggedByChange("anyone"))}
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
  onShowEveryone,
}: {
  period: TimelineInput;
  search: string;
  kind?: InteractionKind;
  origin?: InteractionOrigin;
  pending: boolean;
  onShowEveryone?: () => void;
}) {
  const pages = useCursorPages<Cursor>();
  const input: TimelineInput = { ...period, search, kind, origin, ...pages.cursor };
  const apps = useOrganizationApps();
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
  const filtered = search || kind || origin;
  const empty =
    !filtered && period.loggedBy === "me" && onShowEveryone ? (
      <OwnInteractionsNotice onShowEveryone={onShowEveryone} />
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
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Card size="sm" className="min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {items.length ? <InteractionList rows={items} sources={sources} /> : empty}
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
