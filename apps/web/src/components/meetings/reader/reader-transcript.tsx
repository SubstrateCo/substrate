import { providerNames, type OriginalView } from "@substrate/contracts/meetings";

import { useEffect } from "react";

import { useMeetingsWorkspace } from "../meetings-workspace-context";
import { ContentNotice } from "@/components/feedback/content-notice";
import { recordRows } from "@/components/layout/record-section";
import { OriginalBadge } from "@/components/meetings/sources/meeting-provider";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Item, ItemContent, ItemMedia } from "@/components/ui/item";
import { formatTranscriptOffset } from "@/lib/format/date";
import { AudioLines } from "lucide-react";

export function ReaderTranscript({
  originals,
  originalId,
  turn,
}: {
  originals: OriginalView[];
  originalId?: string;
  turn?: number;
}) {
  const { change } = useMeetingsWorkspace();
  useEffect(() => {
    if (originalId && turn !== undefined)
      document.getElementById(`turn-${originalId}-${turn}`)?.focus();
  }, [originalId, turn]);
  const transcripts = originals.filter((r) => r.turns.length);
  const pending = originals.filter((r) => r.transcriptState === "pending");
  return (
    <>
      {transcripts.map((r) => (
        <section key={r.id} className="not-first:mt-5 not-first:border-t not-first:pt-4">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <Heading level={3}>Transcript</Heading>
            <OriginalBadge
              provider={r.provider}
              onClick={() => change({ readerTab: "sources", originalId: r.id, turn: undefined })}
            />
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            {r.provider === "manual"
              ? "As entered"
              : `${r.turns.length} turns · Time from the start of the call`}
          </p>
          <ol className={recordRows} aria-label={`${providerNames[r.provider]} transcript turns`}>
            {r.turns.map((t, i) => (
              <Item key={i} asChild size="xs" className="items-baseline">
                <li
                  id={`turn-${r.id}-${i}`}
                  tabIndex={-1}
                  aria-current={originalId === r.id && turn === i ? "true" : undefined}
                  className="aria-current:bg-row-selected aria-current:text-row-selected-foreground"
                >
                  {t.offsetMs !== null && (
                    <ItemMedia className="min-w-10.5 justify-start">
                      <time
                        dateTime={`PT${t.offsetMs / 1000}S`}
                        className="text-xs text-muted-foreground tabular-nums"
                      >
                        {formatTranscriptOffset(t.offsetMs)}
                      </time>
                    </ItemMedia>
                  )}
                  <ItemContent className="min-w-0 wrap-anywhere">
                    {t.speaker && <strong>{t.speaker}</strong>}
                    <p className="text-sm/relaxed whitespace-pre-wrap">{t.text}</p>
                  </ItemContent>
                </li>
              </Item>
            ))}
          </ol>
        </section>
      ))}
      {pending.map((r) => (
        <div key={r.id} className="py-3">
          <ContentNotice
            variant="compact"
            icon={AudioLines}
            title="Transcript pending"
            description={`${providerNames[r.provider]} has not finished this transcript.`}
          />
        </div>
      ))}
      {!transcripts.length && !pending.length && (
        <ContentNotice
          icon={AudioLines}
          title="No transcript available"
          description="None of the linked sources supplied a transcript."
          action={
            <Button size="sm" variant="outline" onClick={() => change({ readerTab: "sources" })}>
              Inspect sources
            </Button>
          }
        />
      )}
    </>
  );
}
