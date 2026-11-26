import type { CrmWrite } from "@substrate/contracts/crm/input";

import { useQuery } from "@tanstack/react-query";

import { useMemo, useState } from "react";
import { RefreshControl, SectionList, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { formatDate, formatMoney, overdue } from "@/features/records/format";
import { recordQueries, useCrmWrite } from "@/features/records/queries";
import type { DealListItem, Stage } from "@/features/records/requests";
import type { OnOpenRecord } from "@/features/records/types";
import { Chip, Row, SectionHeader } from "@/features/records/ui/rows";
import { FormSheet } from "@/features/records/ui/sheet";
import { EmptyState, ErrorState, LoadingRows, Notice } from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";
import { ArrowDown, ArrowUp, Handshake, Plus, Trash2 } from "lucide-react-native";

function stageTotal(deals: DealListItem[]) {
  const currencies = new Set(deals.flatMap((deal) => (deal.currency ? [deal.currency] : [])));
  if (currencies.size !== 1) return null;
  const total = deals.reduce((sum, deal) => sum + (deal.amount ? Number(deal.amount) : 0), 0);
  return formatMoney(String(total), [...currencies][0]!);
}

/** Open deals grouped by stage, in pipeline order. */
export function PipelineBoard({
  scope,
  onOpenRecord,
  editingStages,
  onStagesClose,
}: {
  scope: QueryScope;
  onOpenRecord: OnOpenRecord;
  editingStages: boolean;
  onStagesClose: () => void;
}) {
  const stages = useQuery(recordQueries.pipeline(scope));
  const deals = useQuery(recordQueries.pipelineDeals(scope));
  const sections = useMemo(
    () =>
      (stages.data ?? [])
        .filter((stage) => !stage.retired)
        .map((stage) => {
          const data = (deals.data?.deals ?? []).filter((deal) => deal.stageId === stage.id);
          return { stage, data };
        }),
    [stages.data, deals.data],
  );
  if (stages.isPending || deals.isPending) return <LoadingRows label="Loading pipeline" />;
  if (stages.error || deals.error)
    return (
      <ErrorState
        error={stages.error ?? deals.error}
        noun="the pipeline"
        onRetry={() => {
          void stages.refetch();
          void deals.refetch();
        }}
      />
    );
  return (
    <View className="flex-1">
      {deals.data.truncated ? <Notice>Showing the first 1,000 open deals.</Notice> : null}
      <SectionList
        sections={sections}
        keyExtractor={(deal) => deal.entityId}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={deals.isRefetching}
            onRefresh={() => {
              void stages.refetch();
              void deals.refetch();
            }}
          />
        }
        renderSectionHeader={({ section }) => {
          const total = stageTotal(section.data);
          return (
            <SectionHeader
              title={total ? `${section.stage.name} · ${total}` : section.stage.name}
              count={section.data.length}
            />
          );
        }}
        renderSectionFooter={({ section }) =>
          section.data.length ? null : (
            <Text className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              No open deals
            </Text>
          )
        }
        ListEmptyComponent={<EmptyState icon={Handshake} title="No pipeline stages" />}
        renderItem={({ item }) => (
          <Row
            title={item.title}
            subtitle={formatMoney(item.amount, item.currency) || undefined}
            trailing={
              item.expectedCloseDate ? (
                <Chip
                  label={formatDate(item.expectedCloseDate)}
                  tone={overdue(item.expectedCloseDate) ? "danger" : "outline"}
                />
              ) : undefined
            }
            onPress={() => onOpenRecord({ kind: "deal", id: item.entityId })}
          />
        )}
      />
      {editingStages ? (
        <StagesForm scope={scope} stages={stages.data} onClose={onStagesClose} />
      ) : null}
    </View>
  );
}

type DraftStage = Extract<CrmWrite, { action: "configureStages" }>["stages"][number] & {
  key: string;
};

/** Renames, reorders, adds and retires stages. Only workspace admins can save. */
function StagesForm({
  scope,
  stages,
  onClose,
}: {
  scope: QueryScope;
  stages: Stage[];
  onClose: () => void;
}) {
  const write = useCrmWrite(scope);
  const initial = stages
    .filter((stage) => !stage.retired)
    .map((stage) => ({ key: stage.id, id: stage.id, name: stage.name }));
  const [draft, setDraft] = useState<DraftStage[]>(initial);
  const [nextKey, setNextKey] = useState(0);
  const valid =
    draft.length >= 1 &&
    draft.length <= 20 &&
    draft.every((stage) => stage.name.trim().length > 0 && stage.name.trim().length <= 100);
  const move = (index: number, by: number) =>
    setDraft((current) => {
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row!);
      return next;
    });
  return (
    <FormSheet
      title="Pipeline stages"
      description="Only workspace admins can change stages. Move open deals out of a stage before you remove it."
      dirty={
        JSON.stringify(draft.map(({ id, name }) => ({ id, name }))) !==
        JSON.stringify(initial.map(({ id, name }) => ({ id, name })))
      }
      pending={write.isPending}
      canSave={valid}
      error={write.error}
      onClose={onClose}
      onSave={() =>
        write.mutate(
          {
            action: "configureStages",
            stages: draft.map(({ id, name }) =>
              id ? { id, name: name.trim() } : { name: name.trim() },
            ),
          },
          { onSuccess: onClose },
        )
      }
    >
      {draft.map((stage, index) => (
        <View key={stage.key} className="flex-row items-center gap-1">
          <Input
            value={stage.name}
            onChangeText={(name) =>
              setDraft((current) =>
                current.map((row) => (row.key === stage.key ? { ...row, name } : row)),
              )
            }
            maxLength={100}
            accessibilityLabel={`Stage ${index + 1} name`}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            disabled={index === 0}
            onPress={() => move(index, -1)}
            accessibilityLabel={`Move ${stage.name} up`}
          >
            <Icon as={ArrowUp} className="size-4 text-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={index === draft.length - 1}
            onPress={() => move(index, 1)}
            accessibilityLabel={`Move ${stage.name} down`}
          >
            <Icon as={ArrowDown} className="size-4 text-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={draft.length === 1}
            onPress={() => setDraft((current) => current.filter((row) => row.key !== stage.key))}
            accessibilityLabel={`Remove ${stage.name}`}
          >
            <Icon as={Trash2} className="size-4 text-destructive" />
          </Button>
        </View>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        disabled={draft.length >= 20}
        onPress={() => {
          setDraft((current) => [...current, { key: `new-${nextKey}`, name: "" }]);
          setNextKey((key) => key + 1);
        }}
      >
        <Icon as={Plus} className="size-4 text-foreground" />
        <Text>Add stage</Text>
      </Button>
    </FormSheet>
  );
}
