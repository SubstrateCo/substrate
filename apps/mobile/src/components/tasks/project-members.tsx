import { projectCapabilities } from "@substrate/contracts/access/capabilities";
import { permissionLabels } from "@substrate/contracts/access/levels";
import { permissionLevels, type PermissionLevel } from "@substrate/contracts/tasks";
import { grantCandidates, isLastOwner } from "@substrate/contracts/tasks/project-access";

import { useState } from "react";
import { ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTasksWrite } from "@/features/records/queries";
import type { ProjectDetail } from "@/features/records/requests";
import { Chip, Row, SectionHeader } from "@/features/records/ui/rows";
import { ActionSheet, ConfirmSheet, PickerSheet } from "@/features/records/ui/sheet";
import { MutationError } from "@/features/records/ui/states";
import type { QueryScope } from "@/queries/keys";
import { Bot, User, UserPlus } from "lucide-react-native";

type Member = ProjectDetail["members"][number];

/** Who can read the project. Owners change levels, add people, and remove them. Agents use their owner's access. */
export function ProjectMembers({
  scope,
  detail,
  onClose,
}: {
  scope: QueryScope;
  detail: ProjectDetail;
  onClose: () => void;
}) {
  const write = useTasksWrite(scope);
  const projectEntityId = detail.project.entityId;
  const manage = projectCapabilities({
    level: detail.level,
    archived: !!detail.project.archivedAt,
  }).canManageAccess;
  const [selected, setSelected] = useState<Member | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingActor, setAddingActor] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [grant, setGrant] = useState<{ actorEntityId: string; level: PermissionLevel } | null>(
    null,
  );
  const candidates = grantCandidates(detail);
  const share = (actorEntityId: string, level: PermissionLevel) =>
    setGrant({ actorEntityId, level });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88%] w-full gap-0 p-0">
        <DialogHeader className="flex-row items-center gap-2 border-b border-border py-2 pl-5 pr-12">
          <DialogTitle className="flex-1 text-base">Members</DialogTitle>
          {manage ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setAdding(true)}
              accessibilityLabel="Add member"
              disabled={!candidates.length}
            >
              <Icon as={UserPlus} className="size-4 text-foreground" />
              <Text>Add</Text>
            </Button>
          ) : null}
        </DialogHeader>
        <ScrollView className="shrink">
          <Text className="px-4 pt-3 text-xs text-muted-foreground">
            Members can read every task in this project. Workspace admins can also open it.
            {manage ? "" : " Only project owners can change access."}
          </Text>
          <View className="px-4 pt-2">
            <MutationError error={write.error} />
          </View>
          <SectionHeader title="People and agents" count={detail.members.length} />
          {detail.members.map((member) => {
            // The last owner stays fixed so the project always has one.
            const lastOwner = isLastOwner(detail.members, member.actorEntityId);
            return (
              <Row
                key={member.actorEntityId}
                title={member.name}
                subtitle={
                  manage && lastOwner ? "Only owner. Add another owner to change this." : undefined
                }
                leading={
                  <Icon
                    as={member.type === "agent" ? Bot : User}
                    className="size-4 text-muted-foreground"
                  />
                }
                trailing={<Chip label={permissionLabels[member.level]} tone="outline" />}
                onPress={manage && !lastOwner ? () => setSelected(member) : undefined}
                accessibilityLabel={`${member.name}, ${permissionLabels[member.level]}`}
              />
            );
          })}
        </ScrollView>
        {selected ? (
          <ActionSheet
            title={selected.name}
            onClose={() => setSelected(null)}
            actions={[
              ...permissionLevels
                .filter((level) => level !== selected.level)
                .map((level) => ({
                  label: `Change to ${permissionLabels[level].toLowerCase()}`,
                  onPress: () => share(selected.actorEntityId, level),
                })),
              {
                label: "Remove from project",
                destructive: true,
                onPress: () => setRemoving(selected),
              },
            ]}
          />
        ) : null}
        {adding ? (
          <PickerSheet
            title="Add member"
            searchable
            choices={candidates.map((actor) => ({
              value: actor.entityId,
              label: actor.name,
            }))}
            value={null}
            onSelect={setAddingActor}
            onClose={() => setAdding(false)}
          />
        ) : null}
        {addingActor ? (
          <PickerSheet
            title="Access level"
            choices={permissionLevels.map((value) => ({ value, label: permissionLabels[value] }))}
            value={null}
            onSelect={(level) => share(addingActor, level)}
            onClose={() => setAddingActor(null)}
          />
        ) : null}
        {removing ? (
          <ConfirmSheet
            title={`Remove ${removing.name}?`}
            description="They lose access to this project and its tasks. Reassign their tasks first."
            confirmLabel="Remove"
            destructive
            pending={write.isPending}
            error={write.error}
            onCancel={() => setRemoving(null)}
            onConfirm={() =>
              write.mutate(
                { action: "revoke", projectEntityId, actorEntityId: removing.actorEntityId },
                { onSuccess: () => setRemoving(null) },
              )
            }
          />
        ) : null}
        {grant ? (
          <ConfirmSheet
            title="Change project access?"
            description={`${detail.actors.find((actor) => actor.entityId === grant.actorEntityId)?.name ?? "This member"} will have ${permissionLabels[grant.level].toLowerCase()} access to every task, attachment, and task discussion in this project.`}
            confirmLabel="Confirm access"
            pending={write.isPending}
            error={write.error}
            onCancel={() => setGrant(null)}
            onConfirm={() =>
              write.mutate(
                { action: "share", projectEntityId, ...grant },
                { onSuccess: () => setGrant(null) },
              )
            }
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
