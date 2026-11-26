import { providerNames, type OriginalView } from "@substrate/contracts/meetings";

import { useState } from "react";

import { useMeetingsWorkspace } from "../meetings-workspace-context";
import { OriginalText } from "../sources/original-text";
import { Property, PropertyList } from "@/components/layout/record-section";
import { ProviderMark } from "@/components/meetings/sources/meeting-provider";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Heading } from "@/components/ui/heading";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Pressable } from "@/components/ui/pressable";
import {
  formatArchiveDate,
  formatMeetingDuration,
  formatTime,
  formatWallTime,
  localTimeZone,
  parseDateOnly,
} from "@/lib/format/date";
import { ChevronRight } from "lucide-react";

function sourceKind(r: OriginalView) {
  if (r.format === "markdown") return "Markdown export";
  if (r.notes && r.turns.length) return "Notes and transcript";
  if (r.notes) return "Meeting notes";
  return r.turns.length ? "Transcript" : "Meeting record";
}

export function ReaderOriginals({
  originals,
  originalId,
}: {
  originals: OriginalView[];
  originalId?: string;
}) {
  const { change } = useMeetingsWorkspace();
  return (
    <>
      <Heading level={3}>Original records</Heading>
      <p className="mt-1 mb-3 text-xs text-muted-foreground">
        Each source keeps its own title, time, and ID. Expand a record to compare it.
      </p>
      <ul className="grid gap-2.5">
        {originals.map((r) => (
          <li key={r.id}>
            <Collapsible
              asChild
              open={originalId === r.id}
              onOpenChange={(open) => change({ originalId: open ? r.id : undefined })}
            >
              <Item variant="outline" size="xs">
                <ItemHeader className="relative">
                  <ItemMedia>
                    <ProviderMark provider={r.provider} size="record" />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle>
                      <CollapsibleTrigger asChild>
                        <Pressable focus="stretched" aria-describedby={`kind-${r.id}`}>
                          {providerNames[r.provider]}
                          {r.provider === "hex" && " · Anomaly Co"}
                        </Pressable>
                      </CollapsibleTrigger>
                    </ItemTitle>
                    <ItemDescription id={`kind-${r.id}`}>{sourceKind(r)}</ItemDescription>
                  </ItemContent>
                  <ChevronRight
                    aria-hidden
                    className="size-3.5 group-data-[state=open]/item:rotate-90"
                  />
                </ItemHeader>
                <CollapsibleContent className="min-w-0 basis-full">
                  <OriginalFacts original={r} />
                </CollapsibleContent>
              </Item>
            </Collapsible>
          </li>
        ))}
      </ul>
    </>
  );
}

function OriginalFacts({ original: r }: { original: OriginalView }) {
  const [raw, setRaw] = useState(false);
  return (
    <>
      <PropertyList className="mt-3">
        <Property label="Original title">{r.title}</Property>
        <Property label="Source ID">{r.nativeId ?? "Not supplied"}</Property>
        <Property label="Meeting app">{r.platform ?? "Not supplied"}</Property>
        <Property label="Source time">
          {r.startMs === null
            ? `${formatArchiveDate(parseDateOnly(r.localStart.slice(0, 10))!)}, ${formatWallTime(r.localStart)} (time zone not supplied)`
            : `${formatArchiveDate(new Date(r.startMs))}, ${formatTime(r.startMs)} (${localTimeZone()})`}
        </Property>
        <Property label="Duration">{formatMeetingDuration(r.durationMs)}</Property>
        <Property label="People in source">
          {r.people
            .map((p) => (p.evidence === "invited" ? `${p.name} (invited)` : p.name))
            .join(", ") || "Not supplied"}
        </Property>
        <Property label="Occurrence ref.">{r.occurrence ?? "Not supplied"}</Property>
        {r.credit && <Property label="Summary author">{r.credit}</Property>}
      </PropertyList>
      <div className="mt-3 space-y-2 border-t pt-2">
        <Button
          variant="link"
          size="xs"
          className="-ml-2"
          aria-expanded={raw}
          onClick={() => setRaw(!raw)}
        >
          {raw ? "Hide original" : "Inspect original"}
        </Button>
        {raw && <OriginalText id={r.id} />}
      </div>
    </>
  );
}
