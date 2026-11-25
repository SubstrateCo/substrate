import { providerNames, type OriginalView } from "@substrate/contracts/meetings";

import { remarkMeetingNotes } from "./remark-meeting-notes";
import { OriginalBadge } from "@/components/meetings/sources/meeting-provider";
import { MarkdownBody } from "@/components/messaging/markdown/markdown-body";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Item, ItemContent, ItemMedia } from "@/components/ui/item";
import type { ChangeMeetingView } from "@/lib/meetings/navigation";
import { Layers3, ListTodo, Quote } from "lucide-react";

export function ReaderNotes({
  originals,
  change,
}: {
  originals: OriginalView[];
  change: ChangeMeetingView;
}) {
  const notes = originals.filter((r) => r.notes);
  return (
    <>
      {notes.map((r) => (
        <SourceNote key={r.id} src={r} single={notes.length === 1} change={change} />
      ))}
      <p className="mt-5 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
        <Layers3 className="size-3.5" />
        {originals.length} source {originals.length === 1 ? "record" : "records"}, counted as one
        meeting.
      </p>
    </>
  );
}

function SourceNote({
  src,
  single,
  change,
}: {
  src: OriginalView;
  single: boolean;
  change: ChangeMeetingView;
}) {
  return (
    <article className="space-y-2 not-first:mt-5 not-first:border-t not-first:pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <Heading level={3}>{single ? "Summary" : `${providerNames[src.provider]} notes`}</Heading>
        <OriginalBadge
          provider={src.provider}
          onClick={() => change({ readerTab: "sources", originalId: src.id, turn: undefined })}
        />
      </div>
      <MarkdownBody
        body={src.notes ?? ""}
        remarkPlugins={[[remarkMeetingNotes, src.turns]]}
        components={{
          span: ({ node, children }) => {
            const turn = Number(node?.properties["data-turn-index"]);
            if (!Number.isInteger(turn) || turn < 0 || turn >= src.turns.length)
              return <span>{children}</span>;
            return (
              <Button
                size="xs"
                variant="accent"
                onClick={() => change({ readerTab: "transcript", originalId: src.id, turn })}
              >
                <Quote />
                {children}
              </Button>
            );
          },
          ul: ({ node, children, ...props }) =>
            node?.properties["data-note-list"] ? (
              <ul data-not-typeset className="divide-y rounded-lg border">
                {children}
              </ul>
            ) : (
              <ul {...props}>{children}</ul>
            ),
          li: ({ node, children, ...props }) =>
            node?.properties["data-note-item"] ? (
              <Item asChild size="xs" className="items-start">
                <li>
                  <ItemMedia variant="icon">
                    <ListTodo aria-hidden className="mt-0.5 text-muted-foreground" />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <div>{children}</div>
                  </ItemContent>
                </li>
              </Item>
            ) : (
              <li {...props}>{children}</li>
            ),
        }}
      />
      {src.credit && <p className="text-xs text-muted-foreground">Written by {src.credit}</p>}
    </article>
  );
}
