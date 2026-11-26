import { View } from "react-native";

import { InteractionActivity } from "./interaction-activity";
import { InteractionDirectory } from "./interaction-directory";
import { InteractionFeed } from "./interaction-feed";
import { InteractionForm } from "./interaction-form";
import { useWorkspaceApps } from "@/features/records/apps";
import { interactionView, type InteractionView } from "@/features/records/crm/crm-navigation";
import { useCreateInteraction } from "@/features/records/queries";
import type { OnOpenRecord } from "@/features/records/types";
import { Segments } from "@/features/records/ui/rows";
import { firstParam } from "@/lib/navigation";
import type { QueryScope } from "@/queries/keys";
import { router, useLocalSearchParams } from "expo-router";

export function InteractionsScreen({
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
  const params = useLocalSearchParams<{ interactionView?: string }>();
  const view = interactionView(firstParam(params.interactionView));
  const setView = (next: InteractionView) => router.setParams({ interactionView: next });
  const apps = useWorkspaceApps(scope);
  const write = useCreateInteraction(scope);
  const current = view === "accounts" && !apps.enabled("crm") ? "people" : view;
  return (
    <View className="flex-1">
      <Segments
        label="Interaction view"
        value={current}
        onChange={setView}
        options={[
          { value: "timeline", label: "Timeline" },
          { value: "activity", label: "Activity" },
          { value: "people", label: "People" },
          ...(apps.enabled("crm") ? [{ value: "accounts" as const, label: "Organizations" }] : []),
        ]}
      />
      {current === "timeline" ? (
        <InteractionFeed scope={scope} onOpenRecord={onOpenRecord} />
      ) : null}
      {current === "activity" ? (
        <InteractionActivity scope={scope} onOpenRecord={onOpenRecord} />
      ) : null}
      {current === "people" || current === "accounts" ? (
        <InteractionDirectory
          key={current}
          scope={scope}
          type={current}
          onOpenRecord={onOpenRecord}
        />
      ) : null}
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
