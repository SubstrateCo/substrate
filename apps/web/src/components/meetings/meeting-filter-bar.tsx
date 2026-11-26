import { providerNames, type MeetingProvider } from "@substrate/contracts/meetings";

import { useQuery } from "@tanstack/react-query";

import { meetingFilterPatch, meetingFilterValue, sourceChoices } from "./meeting-filters";
import type { MeetingFilterFieldId } from "./meeting-filters";
import { useMeetingsWorkspace } from "./meetings-workspace-context";
import { FilterBar, type FilterField } from "@/components/filters";
import { ProviderMark } from "@/components/meetings/sources/meeting-provider";
import type { MeetingSearch } from "@/lib/meetings/navigation";
import { CalendarDays, Layers } from "lucide-react";

type SourceState = { providers: readonly MeetingProvider[]; loading: boolean; error: boolean };

function meetingFilterFields(
  section: NonNullable<MeetingSearch["section"]>,
  sources: SourceState,
  source?: MeetingProvider,
): FilterField<MeetingFilterFieldId>[] {
  const fields: FilterField<MeetingFilterFieldId>[] = [
    {
      id: "source",
      label: "Source",
      icon: Layers,
      kind: "option",
      options: sourceChoices(sources.providers, source).map((id) => ({
        value: id,
        label: providerNames[id],
        icon: <ProviderMark provider={id} size="row" />,
      })),
      loading: sources.loading,
      error: sources.error ? "Couldn’t load sources." : undefined,
      emptyLabel: "No sources yet.",
    },
  ];
  if (section === "all")
    fields.push({ id: "day", label: "Day", icon: CalendarDays, kind: "date", operators: ["is"] });
  return fields;
}

/**
 * Source and day filters for the archive, and the source filter for the calendar. The
 * transcript search stays in its own field and never becomes a filter.
 */
export function MeetingFilterBar({ clearable }: { clearable: boolean }) {
  const { queries, search, change } = useMeetingsWorkspace();
  const sources = useQuery(queries.sources);
  const section = search.section ?? "all";
  const state: SourceState = {
    providers: sources.isSuccess ? sources.data.map((s) => s.provider) : [],
    loading: sources.isPending,
    error: sources.isError,
  };
  return (
    <FilterBar
      aria-label="Meeting filters"
      fields={meetingFilterFields(section, state, search.source)}
      value={meetingFilterValue(search, section)}
      onValueChange={(value) => change(meetingFilterPatch(value, section))}
      clearable={clearable}
    />
  );
}
