import type { InteractionTimeline as TimelineInput } from "@substrate/contracts/context/interactions";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { InteractionList } from "./interaction-list";
import { interactionKinds, interactionTypes } from "./interaction-types";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { interactionTimelineOptions } from "@/queries/context/interactions";
import { Activity } from "lucide-react";

type Cursor = Pick<TimelineInput, "beforeOccurredAt" | "beforeEntityId">;

export function InteractionTimeline({ period }: { period: TimelineInput }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [origin, setOrigin] = useState("all");
  const debounced = useSearchDebounce(search, `${kind}:${origin}`);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap gap-3">
        <div className="min-w-40 flex-1">
          <Input
            aria-label="Search interactions"
            placeholder="Search contacts or summaries"
            value={search}
            maxLength={200}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
          </SelectContent>
        </Select>
      </div>
      <TimelinePage
        key={`${debounced.query}:${kind}:${origin}`}
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
  const [cursor, setCursor] = useState<Cursor>({});
  const input: TimelineInput = {
    ...period,
    search,
    kind: interactionKinds.find((k) => k === kind),
    origin: (["manual", "message_publication"] as const).find((value) => value === origin),
    ...cursor,
  };
  const query = useQuery({ ...interactionTimelineOptions(input), enabled: !pending });
  if (query.error)
    return <ErrorState title="Couldn’t load interactions" onRetry={() => void query.refetch()} />;
  if (!query.data) return <LoadingState label="Loading interactions…" rows={5} />;
  const { items, nextCursor } = query.data;
  const filtered = search || kind !== "all" || origin !== "all";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Card size="sm" className="min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.length ? (
            <InteractionList rows={items} organizationId={period.organizationId} />
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
      {(cursor.beforeEntityId || nextCursor) && (
        <div className="flex shrink-0 justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!cursor.beforeEntityId}
            onClick={() => setCursor({})}
          >
            Newest
          </Button>
          {nextCursor && (
            <Button variant="outline" size="sm" onClick={() => setCursor(nextCursor)}>
              Older interactions
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
