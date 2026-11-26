import type { ReferenceQuery, ReferenceTab } from "@substrate/contracts/messaging/references";

import { useState } from "react";

import { ReferencePickerView, type ReferenceOption } from "./reference-picker-view";
import {
  referenceTabs,
  useReferenceSearch,
  useMessagingApps,
} from "@/features/messaging/queries/use-reference-search";

export function ReferencePicker({
  organizationId,
  conversationId,
  query,
  onPick,
}: {
  organizationId: string;
  conversationId: string;
  query: ReferenceQuery;
  onPick: (option: ReferenceOption) => void;
}) {
  const apps = useMessagingApps(organizationId);
  const tasks = apps.enabled("tasks");
  const tabs = referenceTabs(query.trigger, tasks);
  // A typed prefix such as "@task:" picks the tab until the person picks another.
  const [choice, setChoice] = useState<{ prefix: ReferenceTab; tab: ReferenceTab }>({
    prefix: query.kind,
    tab: query.kind,
  });
  const selected = choice.prefix === query.kind ? choice.tab : query.kind;
  const tab = tabs.includes(selected) ? selected : tabs[0]!;
  const search = useReferenceSearch({
    organizationId,
    conversationId,
    query: query.query,
    tab,
    tasks,
    enabled: apps.ready,
  });
  return (
    <ReferencePickerView
      tabs={tabs}
      tab={tab}
      query={query.query}
      options={search.rows}
      // Without app settings, the picker cannot know which kinds to offer.
      loading={apps.loading || (apps.ready && search.loading)}
      error={apps.error ?? search.error}
      onTab={(next) => setChoice({ prefix: query.kind, tab: next })}
      onRetry={apps.error ? apps.retry : search.retry}
      onPick={onPick}
    />
  );
}
