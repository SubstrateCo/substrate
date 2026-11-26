import { providerNames } from "@substrate/contracts/meetings";

import { formatDayLabel, parseDateOnly } from "@/lib/format/date";
import type { ChangeMeetingView, MeetingSearch } from "@/lib/meetings/navigation";

export type ActiveFilter = { label: string; clear: () => void };

export function activeFilters({
  search,
  section,
  query,
  change,
  clearPhrase,
}: {
  search: MeetingSearch;
  section: NonNullable<MeetingSearch["section"]>;
  query: string;
  change: ChangeMeetingView;
  clearPhrase: () => void;
}) {
  const filters: ActiveFilter[] = [];
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
  if (query) filters.push({ label: `“${query}”`, clear: clearPhrase });
  return filters;
}
