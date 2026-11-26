import {
  providerIds,
  type MeetingListInput,
  type MeetingProvider,
} from "@substrate/contracts/meetings";

import type { FilterValue } from "@/components/filters";
import type { MeetingSearch } from "@/lib/meetings/navigation";

export type MeetingFilterFieldId = "source" | "day";

type MeetingSection = NonNullable<MeetingSearch["section"]>;

/** The source and day filters as filter-bar clauses. Day filters only the archive. */
export function meetingFilterValue(
  search: MeetingSearch,
  section: MeetingSection,
): FilterValue<MeetingFilterFieldId> {
  const value: FilterValue<MeetingFilterFieldId> = {};
  if (search.source) value.source = { operator: "is", values: [search.source] };
  if (section === "all" && search.day) value.day = { operator: "is", values: [search.day] };
  return value;
}

/**
 * The URL patch for filter-bar clauses: source, and day in the archive. Every change returns
 * to the first page.
 */
export function meetingFilterPatch(
  value: FilterValue<MeetingFilterFieldId>,
  section: MeetingSection,
): Partial<MeetingSearch> {
  const chosen = value.source?.values[0];
  const source = providerIds.find((id) => id === chosen);
  const patch: Partial<MeetingSearch> = { source, offset: 0 };
  if (section === "all") patch.day = value.day?.values[0];
  return patch;
}

/** Names what the empty state's reset clears: the search, the filters, or both. */
export function clearFiltersLabel({
  q,
  source,
  day,
}: Pick<MeetingListInput, "q" | "source" | "day">) {
  const filtered = !!(source || day);
  if (q && filtered) return "Clear search and filters";
  return q ? "Clear search" : "Clear filters";
}

/** The providers to offer, with a chosen source kept even when it has no records yet. */
export function sourceChoices(providers: readonly MeetingProvider[], source?: MeetingProvider) {
  return source && !providers.includes(source) ? [...providers, source] : [...providers];
}
