import { useInfiniteQuery } from "@tanstack/react-query";

import { useState } from "react";
import { View } from "react-native";

import { InteractionForm } from "./interaction-form";
import { InteractionRow } from "./interaction-row";
import {
  interactionKindLabels,
  interactionKinds,
  type InteractionKind,
} from "@/features/records/format";
import type { InteractionDays, InteractionOrigin } from "@/features/records/interaction-filters";
import { recordQueries, useCreateInteraction } from "@/features/records/queries";
import type { OnOpenRecord } from "@/features/records/types";
import { SearchBar, useDebounced } from "@/features/records/ui/layout";
import { PagedList } from "@/features/records/ui/record-list";
import { Segments } from "@/features/records/ui/rows";
import type { QueryScope } from "@/queries/keys";
import { MessagesSquare } from "lucide-react-native";

type KindFilter = InteractionKind | "all";

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
  const [kind, setKind] = useState<KindFilter>("all");
  const [days, setDays] = useState<InteractionDays>("all");
  const [origin, setOrigin] = useState<InteractionOrigin | "all">("all");
  const term = useDebounced(search.trim());
  const query = useInfiniteQuery(
    recordQueries.interactionTimeline(scope, {
      search: term,
      kind: kind === "all" ? undefined : kind,
      days,
      origin: origin === "all" ? undefined : origin,
    }),
  );
  const write = useCreateInteraction(scope);
  return (
    <View className="flex-1">
      <SearchBar value={search} onChange={setSearch} placeholder="Search interactions and people" />
      <Segments
        label="Interaction type"
        value={kind}
        onChange={setKind}
        options={[
          { value: "all", label: "All" },
          ...interactionKinds.map((value) => ({ value, label: interactionKindLabels[value] })),
        ]}
      />
      <Segments
        label="Interaction period"
        value={days}
        onChange={setDays}
        options={[
          { value: "all", label: "All time" },
          { value: "7", label: "Last 7 days" },
          { value: "30", label: "Last 30 days" },
        ]}
      />
      <Segments
        label="Interaction origin"
        value={origin}
        onChange={setOrigin}
        options={[
          { value: "all", label: "All sources" },
          { value: "manual", label: "Manual" },
          { value: "message_publication", label: "Discussion" },
          { value: "calendar_event", label: "Calendar" },
        ]}
      />
      <PagedList
        query={query}
        noun="interactions"
        items={(pages) => pages.flatMap((page) => page.items)}
        keyOf={(item) => item.entityId}
        empty={{
          icon: MessagesSquare,
          title:
            term || kind !== "all" || days !== "all" || origin !== "all"
              ? "No interactions match"
              : "No interactions yet",
          description:
            term || kind !== "all" || days !== "all" || origin !== "all"
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
