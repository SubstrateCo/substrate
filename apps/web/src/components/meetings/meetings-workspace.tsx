import type { MeetingListInput, MeetingScope } from "@substrate/contracts/meetings";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useRef, useState } from "react";

import { AllMeetings } from "./archive/all-meetings";
import { MeetingSearchField } from "./archive/meeting-search";
import { MeetingSidebar } from "./archive/meeting-sidebar";
import { NewMeetingDialog } from "./archive/new-meeting-dialog";
import { MeetingCalendar } from "./calendar/meeting-calendar";
import { HexImportResult } from "./hex-import-result";
import { MeetingsWorkspaceContext } from "./meetings-workspace-context";
import { MeetingReader } from "./reader/meeting-reader";
import { MatchReview } from "./sources/match-review";
import { importHex } from "@/api/meetings/requests";
import { PendingButton } from "@/components/feedback/pending-button";
import { PageLayout, PageContent } from "@/components/layout/page-layout";
import { Sheet } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import {
  closedReader,
  type ChangeMeetingView,
  type MeetingSearch,
} from "@/lib/meetings/navigation";
import { meetingQueries, type MeetingQueries } from "@/queries/meetings/options";
import { cn } from "cn";
import { FileDown } from "lucide-react";

function archiveInput(search: MeetingSearch, query: string): MeetingListInput {
  return {
    sort: search.sort ?? "date",
    dir: search.dir ?? "desc",
    offset: search.offset ?? 0,
    q: query || undefined,
    source: search.source,
    day: search.day,
  };
}

// Totals stay undefined until their queries load.
function useArchiveTotals(queries: MeetingQueries) {
  const archive = useQuery(queries.list({ sort: "date", dir: "desc", offset: 0 }));
  const sources = useQuery(queries.sources);
  const originals = sources.isSuccess ? sources.data : undefined;
  return {
    total: archive.isSuccess ? archive.data.total : undefined,
    providers: originals?.map((s) => s.provider) ?? [],
    pending: originals?.reduce((n, c) => n + c.pendingReview, 0),
  };
}

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
  const queries = meetingQueries({ userId, organizationId });
  const section = search.section ?? "all",
    opener = useRef<HTMLElement | null>(null);
  // Transcript searches go to the private archive, never into URLs or workspace search.
  const [phrase, setPhrase] = useState("");
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const filter = useSearchDebounce(phrase.trim(), organizationId);
  const searchPending = Boolean(filter.query) && filter.pending;
  const totals = useArchiveTotals(queries);
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
  const importFile = () => {
    setMenu(false);
    picker.current?.click();
  };
  const inContent = useMediaQuery("(max-width: 1050px)");
  const reader = section === "all" && search.meetingId && (
    <MeetingReader
      key={search.meetingId}
      id={search.meetingId}
      close={close}
      inContent={inContent}
    />
  );
  return (
    <MeetingsWorkspaceContext value={{ scope, queries, search, change }}>
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
            total={totals.total}
            providers={totals.providers}
            pending={totals.pending}
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
              <HexImportResult error={importing.error} report={importing.data} />
              {section === "all" && (
                <AllMeetings
                  input={archiveInput(search, filter.query)}
                  searchPending={searchPending}
                  open={open}
                  clearFilters={() => {
                    setPhrase("");
                    change({ ...closedReader, source: undefined, day: undefined, offset: 0 });
                  }}
                  addMeeting={() => setAdding(true)}
                />
              )}
              {section === "calendar" && (
                <MeetingCalendar phrase={filter.query} searchPending={searchPending} />
              )}
              {section === "review" && <MatchReview />}
            </div>
            {inContent && reader}
          </PageContent>
          {!inContent && reader}
        </PageLayout>
      </Sheet>
    </MeetingsWorkspaceContext>
  );
}
