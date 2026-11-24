import { providerNames, type MeetingScope } from "@substrate/contracts/meetings";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useMemo, useRef, useState } from "react";

import { AllMeetings } from "./archive/all-meetings";
import { MeetingSearchField } from "./archive/meeting-search";
import { MeetingSidebar } from "./archive/meeting-sidebar";
import { NewMeetingDialog } from "./archive/new-meeting-dialog";
import { MeetingCalendar } from "./calendar/meeting-calendar";
import { MeetingReader } from "./reader/meeting-reader";
import { MatchReview } from "./sources/match-review";
import { importHex } from "@/api/meetings/requests";
import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { PageLayout, PageContent } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { formatDayLabel, parseDateOnly } from "@/lib/format/date";
import {
  closedReader,
  type ChangeMeetingView,
  type MeetingSearch,
} from "@/lib/meetings/navigation";
import { meetingQueries } from "@/queries/meetings/options";
import { cn } from "cn";
import { FileDown, X } from "lucide-react";

export function MeetingsWorkspace({
  scope,
  search,
}: {
  scope: MeetingScope;
  search: MeetingSearch;
}) {
  const navigate = useNavigate({ from: "/meetings/" }),
    client = useQueryClient();
  const { userId, organizationId } = scope;
  const queries = useMemo(
    () => meetingQueries({ userId, organizationId }),
    [userId, organizationId],
  );
  const section = search.section ?? "all",
    opener = useRef<HTMLElement | null>(null);
  // Transcript searches go to the private archive, never into URLs or workspace search.
  const [phrase, setPhrase] = useState("");
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const filter = useSearchDebounce(phrase.trim(), organizationId);
  const searchPending = Boolean(filter.query) && filter.pending;
  const archive = useQuery(queries.list({ sort: "date", dir: "desc", offset: 0 }));
  const sources = useQuery(queries.sources);
  const originals = sources.isSuccess ? sources.data : undefined;
  const change: ChangeMeetingView = (patch, replace = false) => {
    setMenu(false);
    void navigate({
      to: "/meetings",
      search: (prior) => ({ ...prior, workspaceId: organizationId, ...patch }),
      replace,
    });
  };
  function updatePhrase(value: string) {
    setPhrase(value);
    if (search.meetingId || search.offset || (section !== "all" && section !== "calendar"))
      change(
        {
          ...closedReader,
          offset: undefined,
          section: section === "calendar" ? "calendar" : "all",
        },
        true,
      );
  }
  function open(id: string) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    change({ ...closedReader, meetingId: id });
  }
  function close() {
    const id = search.meetingId;
    change(closedReader);
    requestAnimationFrame(() =>
      (document.getElementById(`meeting-${id}`) ?? opener.current)?.focus({ preventScroll: true }),
    );
  }
  const picker = useRef<HTMLInputElement>(null);
  const importing = useMutation({
    mutationFn: (file: File) => importHex(scope, file),
    onSuccess: () => void client.invalidateQueries({ queryKey: queries.root }),
  });
  const report = importing.data;
  const importFile = () => {
    setMenu(false);
    picker.current?.click();
  };
  const inContent = useMediaQuery("(max-width: 1050px)");
  const reader = section === "all" && search.meetingId && (
    <MeetingReader
      key={search.meetingId}
      id={search.meetingId}
      {...{ queries, search, change, close, inContent }}
    />
  );
  const filters = [];
  if (search.source)
    filters.push({
      label: providerNames[search.source],
      clear: () => change({ source: undefined, offset: 0 }),
    });
  if (section === "all" && search.day)
    filters.push({
      label: formatDayLabel(parseDateOnly(search.day)!),
      clear: () => change({ day: undefined, offset: 0 }),
    });
  if (filter.query) filters.push({ label: `“${filter.query}”`, clear: () => updatePhrase("") });
  const chips = filters.length ? (
    <div aria-label="Active filters" className="flex shrink-0 flex-wrap gap-1.5">
      {filters.map(({ label, clear }) => (
        <Button
          key={label}
          size="xs"
          variant="outline"
          className="max-w-full"
          aria-label={`Clear ${label} filter`}
          onClick={clear}
        >
          <span className="truncate">{label}</span>
          <X />
        </Button>
      ))}
    </div>
  ) : null;
  return (
    <Sheet open={menu} onOpenChange={setMenu}>
      <input
        ref={picker}
        type="file"
        accept=".md,.markdown"
        className="hidden"
        aria-label="Choose Hex Markdown file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) importing.mutate(file);
        }}
      />
      <MeetingSearchField phrase={phrase} onChange={updatePhrase} />
      {adding && (
        <NewMeetingDialog
          scope={scope}
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            setPhrase("");
            change({
              ...closedReader,
              section: "all",
              source: undefined,
              day: undefined,
              offset: 0,
              meetingId: id,
            });
          }}
        />
      )}
      <PageLayout id="meetings" aria-label="Meetings workspace">
        <MeetingSidebar
          search={search}
          change={change}
          total={archive.isSuccess ? archive.data.total : undefined}
          providers={originals?.map((s) => s.provider) ?? []}
          pending={originals?.reduce((n, c) => n + c.pendingReview, 0)}
          importButton={
            <PendingButton
              variant="sidebar"
              className="justify-start"
              pending={importing.isPending}
              onClick={importFile}
            >
              <FileDown />
              Import Hex file
            </PendingButton>
          }
          onSelectSection={(next) => {
            if (next !== "calendar") setPhrase("");
            change({
              ...closedReader,
              section: next,
              day: undefined,
              offset: undefined,
              source: next === "calendar" ? search.source : undefined,
            });
          }}
        />
        <PageContent data-meeting-archive>
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col p-4 md:p-5 xl:p-6",
              section === "all" ? "gap-3" : "overflow-y-auto",
              inContent && reader && "hidden",
            )}
          >
            {importing.error || report ? (
              <FormMessage
                error={importing.error}
                errorDescription="Couldn’t import the file. Choose a complete Hex meeting Markdown export."
                message={
                  report
                    ? `Imported: ${report.added} new, ${report.updated} updated, ${report.linked} linked, ${report.unchanged} unchanged, ${report.review} to review.`
                    : undefined
                }
              />
            ) : null}
            {section === "all" && (
              <AllMeetings
                queries={queries}
                input={{
                  sort: search.sort ?? "date",
                  dir: search.dir ?? "desc",
                  offset: search.offset ?? 0,
                  q: filter.query || undefined,
                  source: search.source,
                  day: search.day,
                }}
                originals={originals?.reduce((n, c) => n + c.linked, 0)}
                filters={chips}
                view={search}
                {...{ searchPending, change, open }}
                clearFilters={() => {
                  setPhrase("");
                  change({ ...closedReader, source: undefined, day: undefined, offset: 0 });
                }}
                addMeeting={() => setAdding(true)}
              />
            )}
            {section === "calendar" && (
              <MeetingCalendar
                queries={queries}
                search={search}
                change={change}
                phrase={filter.query}
                searchPending={searchPending}
                filters={chips}
              />
            )}
            {section === "review" && <MatchReview {...{ scope, queries }} />}
          </div>
          {inContent && reader}
        </PageContent>
        {!inContent && reader}
      </PageLayout>
    </Sheet>
  );
}
