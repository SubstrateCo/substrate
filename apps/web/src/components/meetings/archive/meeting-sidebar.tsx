import { providerNames, type MeetingProvider } from "@substrate/contracts/meetings";

import { Link } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { toneFill } from "@/components/feedback/tag";
import {
  PageSidebar,
  PageSidebarContent,
  PageSidebarGroupTitle,
  PageSidebarHeader,
} from "@/components/layout/page-layout";
import { ProviderMark } from "@/components/meetings/sources/meeting-provider";
import { Button } from "@/components/ui/button";
import { SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  closedReader,
  type ChangeMeetingView,
  type MeetingSearch,
} from "@/lib/meetings/navigation";
import { cn } from "cn";
import { ArrowLeft, CalendarDays, GitMerge, LibraryBig } from "lucide-react";

export function MeetingSidebar({
  search,
  change,
  total,
  pending,
  providers,
  importButton,
  onSelectSection,
}: {
  search: MeetingSearch;
  change: ChangeMeetingView;
  total?: number;
  pending?: number;
  providers: MeetingProvider[];
  importButton: ReactNode;
  onSelectSection: (section: NonNullable<MeetingSearch["section"]>) => void;
}) {
  const section = search.section ?? "all";
  const narrow = useMediaQuery("(max-width: 767px)");
  const compact = useMediaQuery("(max-width: 1240px)");
  const large = useMediaQuery("(min-width: 1550px)");
  let defaultWidth = 223;
  if (compact) defaultWidth = 193;
  if (large) defaultWidth = 239;
  const body = (
    <>
      <PageSidebarHeader
        title={
          <span className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            Meetings
          </span>
        }
      />
      <PageSidebarContent className="space-y-6 pt-2">
        <nav aria-label="Meeting views" className="flex flex-col gap-0.5">
          <PageSidebarGroupTitle>Library</PageSidebarGroupTitle>
          <Button
            variant="sidebar"
            className="justify-start"
            aria-label="All meetings"
            aria-current={section === "all" && !search.source ? "page" : undefined}
            onClick={() => onSelectSection("all")}
          >
            <LibraryBig />
            All meetings <span className="ml-auto text-xs tabular-nums">{total}</span>
          </Button>
          <Button
            variant="sidebar"
            className="justify-start"
            aria-current={section === "calendar" ? "page" : undefined}
            onClick={() => onSelectSection("calendar")}
          >
            <CalendarDays />
            Calendar
          </Button>
          <Button
            variant="sidebar"
            className="justify-start"
            aria-label="Match review"
            aria-current={section === "review" ? "page" : undefined}
            onClick={() => onSelectSection("review")}
          >
            <GitMerge />
            Match review{" "}
            {pending != null && pending > 0 && (
              <span
                className={cn(
                  "ml-auto rounded-md px-1.5 text-xs font-medium text-warning-text tabular-nums",
                  toneFill.warning,
                )}
              >
                {pending}
              </span>
            )}
          </Button>
        </nav>
        {providers.length > 0 && (
          <nav aria-label="Filter meetings by source" className="flex flex-col gap-0.5">
            <PageSidebarGroupTitle>Sources</PageSidebarGroupTitle>
            {providers.map((id) => (
              <Button
                variant="sidebar"
                className="justify-start"
                key={id}
                aria-current={search.source === id ? "page" : undefined}
                onClick={() =>
                  change({
                    ...closedReader,
                    source: search.source === id ? undefined : id,
                    section: section === "calendar" ? "calendar" : "all",
                    day: undefined,
                    offset: undefined,
                  })
                }
              >
                <ProviderMark provider={id} />
                {providerNames[id]}
              </Button>
            ))}
          </nav>
        )}
      </PageSidebarContent>
      <div className="flex shrink-0 flex-col border-t px-2 py-2.5">
        {importButton}
        {narrow && (
          <Button variant="sidebar" className="justify-start" asChild>
            <Link to="/dashboard">
              <ArrowLeft />
              Back to workspace
            </Link>
          </Button>
        )}
      </div>
    </>
  );
  return narrow ? (
    <SheetContent side="left" className="w-67.5 max-w-5/6" aria-describedby={undefined}>
      <SheetTitle className="sr-only">Meeting navigation</SheetTitle>
      {body}
    </SheetContent>
  ) : (
    <PageSidebar aria-label="Meeting navigation" defaultWidth={defaultWidth}>
      {body}
    </PageSidebar>
  );
}
