import { useInfiniteQuery } from "@tanstack/react-query";

import { useState } from "react";
import { View } from "react-native";

import { InteractionForm } from "./interaction-form";
import { InteractionRow } from "./interaction-row";
import type { FilterField, FilterValue } from "@/features/records/filters";
import { interactionKindLabels, interactionKinds } from "@/features/records/format";
import { timelineFilters, type TimelineFilterId } from "@/features/records/interactions/interaction-filters";
import { recordQueries, useCreateInteraction } from "@/features/records/queries";
import type { OnOpenRecord } from "@/features/records/types";
import { FilterBar } from "@/features/records/ui/filter-bar";
import { SearchBar, useDebounced } from "@/features/records/ui/layout";
import { PagedList } from "@/features/records/ui/record-list";
import type { QueryScope } from "@/queries/keys";
import { CalendarRange, MessagesSquare, Tag, Waypoints } from "lucide-react-native";

const timelineFields: FilterField<TimelineFilterId>[] = [
  {
    id: "type",
    label: "Type",
    icon: Tag,
    options: interactionKinds.map((value) => ({ value, label: interactionKindLabels[value] })),
  },
  {
    id: "period",
    label: "Period",
    icon: CalendarRange,
    options: [
      { value: "7", label: "Last 7 days" },
      { value: "30", label: "Last 30 days" },
    ],
  },
  {
    id: "source",
    label: "Source",
    icon: Waypoints,
    options: [
      { value: "manual", label: "Manual" },
      { value: "message_publication", label: "Discussion" },
      { value: "calendar_event", label: "Calendar" },
    ],
  },
];

/** Every interaction the reader can see, newest first. */
export function InteractionFeed({
  scope,
  onOpenRecord,
  logging,
  onLogClose,
}: {
  scope: QueryScope;
  onOpenRecord: OnOpenRecord;
  logging: boolean;
  onLogClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValue<TimelineFilterId>>({});
  const { kind, days, origin } = timelineFilters(filters);
  const term = useDebounced(search.trim());
  const query = useInfiniteQuery(
    recordQueries.interactionTimeline(scope, { search: term, kind, days, origin }),
  );
  const filtered = !!term || !!kind || days !== "all" || !!origin;
  const write = useCreateInteraction(scope);
  return (
    <View className="flex-1">
      <SearchBar value={search} onChange={setSearch} placeholder="Search interactions and people" />
      <FilterBar
        label="Interaction filters"
        fields={timelineFields}
        value={filters}
        onChange={setFilters}
      />
      <PagedList
        query={query}
        noun="interactions"
        items={(pages) => pages.flatMap((page) => page.items)}
        keyOf={(item) => item.entityId}
        empty={{
          icon: MessagesSquare,
          title: filtered ? "No interactions match" : "No interactions yet",
          description: filtered
            ? undefined
            : "Log calls, meetings and notes from a contact, or publish them from a message.",
        }}
        renderItem={(item) => (
          <InteractionRow
            interaction={item}
            showContact
            onPress={() => onOpenRecord({ kind: "interaction", id: item.entityId })}
          />
        )}
      />
      {logging ? (
        <InteractionForm
          scope={scope}
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            onLogClose();
          }}
          onSubmit={(draft) =>
            write.mutate(draft, {
              onSuccess: (id) => {
                onLogClose();
                onOpenRecord({ kind: "interaction", id });
              },
            })
          }
        />
      ) : null}
    </View>
  );
}
