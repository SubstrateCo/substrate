import type { MeetingDetail } from "@substrate/contracts/meetings";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useEffect, useRef } from "react";

import { useMeetingsWorkspace } from "../meetings-workspace-context";
import { ReaderNotes } from "./reader-notes";
import { ReaderOriginals } from "./reader-originals";
import { ReaderTranscript } from "./reader-transcript";
import { isAccessFailure } from "@/api/access-failure";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { PageAside } from "@/components/layout/page-layout";
import { OriginalBadge } from "@/components/meetings/sources/meeting-provider";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatDayLabel,
  formatMeetingDuration,
  formatWallTime,
  parseDateOnly,
} from "@/lib/format/date";
import { peopleLabels } from "@/lib/meetings/display";
import { sourceView } from "@/lib/meetings/navigation";
import { messageLink } from "@/lib/navigation/record-links";
import { cn } from "cn";
import { CalendarDays, Clock3, NotebookPen, PanelRight, Unlink, Video, X } from "lucide-react";

function ReaderContent({
  record: { meeting, originals, sourceMessage },
}: {
  record: MeetingDetail;
}) {
  const { queries, search, change } = useMeetingsWorkspace();
  const tab = search.readerTab ?? "notes";
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // MeetingReader is keyed by meeting, so this runs once per meeting opened. A deep-linked
    // transcript turn takes focus in ReaderTranscript, whose effect runs first.
    if (!document.activeElement?.id.startsWith("turn-"))
      title.current?.focus({ preventScroll: true });
  }, []);
  const people = peopleLabels(meeting.people);
  return (
    <div className="mx-auto w-full max-w-200">
      <div className="p-4 pb-3 md:p-5 md:pb-4 xl:p-6 xl:pb-4">
        <Heading
          level={2}
          variant="record"
          ref={title}
          tabIndex={-1}
          className="mb-2 wrap-anywhere outline-none"
        >
          {meeting.title}
        </Heading>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground [&_span]:inline-flex [&_span]:items-center [&_span]:gap-1.5 [&_svg]:size-3.5">
          <span>
            <CalendarDays />
            {formatDayLabel(parseDateOnly(meeting.localStart.slice(0, 10))!)}
          </span>
          <span>
            <Clock3 />
            {formatWallTime(meeting.localStart)} · {formatMeetingDuration(meeting.durationMs)}
          </span>
          {meeting.platform && (
            <span>
              <Video />
              {meeting.platform}
            </span>
          )}
        </div>
        <div
          aria-label="People and speaker labels from linked sources"
          className="mt-3.5 flex items-center gap-2 text-xs"
        >
          {people.length > 0 && (
            <span className="inline-flex shrink-0 -space-x-0.5">
              {people.slice(0, 4).map((label) => (
                <PersonAvatar key={label} name={label.endsWith(" (unnamed)") ? "?" : label} />
              ))}
            </span>
          )}
          <span className="min-w-0 wrap-anywhere">
            {people.join(", ") || "No people identified"}
          </span>
        </div>
        <div aria-label="Attached sources" className="mt-3 flex flex-wrap gap-1">
          {originals.map((r) => (
            <OriginalBadge
              key={r.id}
              provider={r.provider}
              onClick={() => change(sourceView(r.id))}
            />
          ))}
        </div>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === "notes" || value === "transcript" || value === "sources")
            change({ readerTab: value, originalId: undefined, turn: undefined });
        }}
      >
        <div className="border-b px-4 md:px-5 xl:px-6">
          <TabsList variant="line" aria-label="Meeting sections">
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="sources" aria-label={`Sources (${originals.length})`}>
              Sources <span className="text-xs text-muted-foreground">{originals.length}</span>
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="px-4 pt-3 pb-5 md:px-5 xl:px-6">
          <TabsContent value="notes">
            {meeting.notes ? (
              <ReaderNotes originals={originals} />
            ) : (
              <ContentNotice
                icon={NotebookPen}
                title="No written notes"
                description="No linked source supplied written notes."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      change({ readerTab: meeting.transcript ? "transcript" : "sources" })
                    }
                  >
                    {meeting.transcript ? "Read transcript" : "Inspect sources"}
                  </Button>
                }
              />
            )}
          </TabsContent>
          <TabsContent value="transcript">
            <ReaderTranscript originals={originals} />
          </TabsContent>
          <TabsContent value="sources">
            {sourceMessage && (
              <Button variant="link" size="sm" asChild>
                <Link
                  {...messageLink(
                    queries.organizationId,
                    sourceMessage.conversationId,
                    sourceMessage.messageId,
                  )}
                >
                  Open source message
                </Link>
              </Button>
            )}
            <ReaderOriginals originals={originals} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export function MeetingReader({
  id,
  close,
  inContent,
}: {
  id: string;
  close: () => void;
  inContent: boolean;
}) {
  const { queries } = useMeetingsWorkspace();
  const q = useQuery(queries.detail(id));
  let body;
  if (q.error && !isAccessFailure(q.error))
    body = <ErrorState title="Couldn’t read this meeting" onRetry={() => void q.refetch()} />;
  else if (q.isPending) body = <LoadingState label="Reading meeting" />;
  else if (q.isSuccess && q.data) body = <ReaderContent record={q.data} />;
  else
    body = (
      <ContentNotice
        icon={Unlink}
        title="Meeting unavailable"
        description="This meeting is not in your archive for this workspace."
      />
    );
  const Pane = inContent ? "aside" : PageAside;
  return (
    <Pane
      aria-label="Meeting details"
      className={cn("bg-card", inContent && "flex min-h-0 flex-1 flex-col")}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
    >
      <PageHeader
        variant="pane"
        icon={<PanelRight className="text-muted-foreground" />}
        title="Meeting details"
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close meeting details"
                onClick={close}
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close meeting details</TooltipContent>
          </Tooltip>
        }
      />
      <div className="min-h-0 overflow-y-auto">{body}</div>
    </Pane>
  );
}
