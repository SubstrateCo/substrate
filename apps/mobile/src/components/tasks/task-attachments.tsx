import { MAX_ATTACHMENTS } from "@substrate/contracts/files/attachments";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import { View } from "react-native";

import { uploadFile } from "@/api/files/uploads";
import { Text } from "@/components/ui/text";
import { pickDocuments } from "@/features/messaging/composer/pick-files";
import { taskApi, saveTaskAttachment, type TaskTarget } from "@/features/records/task-api";
import { DetailSection, Row } from "@/features/records/ui/rows";
import { ActionSheet, ConfirmSheet } from "@/features/records/ui/sheet";
import { ErrorState, MutationError } from "@/features/records/ui/states";
import { queryKeys, type QueryScope } from "@/queries/keys";

export function TaskAttachments({
  scope,
  target,
  editable,
}: {
  scope: QueryScope;
  target: TaskTarget;
  editable: boolean;
}) {
  const client = useQueryClient();
  const queryKey = [
    ...queryKeys.detail(scope, "tasks", target.taskEntityId),
    "attachments",
    target,
  ];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => taskApi.attachments(target, signal),
    retry: false,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const attachment = query.data?.find((row) => row.id === selected);
  const write = useMutation({
    retry: false,
    mutationFn: async (action: "add" | "remove" | "save") => {
      if (action === "add") {
        if (!editable) throw new Error("This task is read-only.");
        const files = await pickDocuments();
        if (!files.length) return;
        if (files.length + (query.data?.length ?? 0) > MAX_ATTACHMENTS)
          throw new Error(`A task can have up to ${MAX_ATTACHMENTS} attachments.`);
        const ids = [];
        for (const file of files) ids.push(await uploadFile(file));
        await taskApi.attach({ ...target, attachmentFileIds: ids });
      } else {
        if (!attachment) throw new Error("Select the attachment again.");
        if (action === "save")
          return saveTaskAttachment(
            { ...target, attachmentId: attachment.id },
            attachment.filename,
          );
        if (!editable) throw new Error("This task is read-only.");
        await taskApi.remove({ ...target, attachmentId: attachment.id });
      }
    },
    onSuccess: async () => {
      setSelected(null);
      setRemoving(false);
      await client.invalidateQueries({ queryKey });
    },
  });
  return (
    <DetailSection
      title="Attachments"
      count={query.data?.length || undefined}
      action={
        editable && !write.isPending && query.isSuccess
          ? { label: "Add files", onPress: () => write.mutate("add") }
          : undefined
      }
    >
      {query.isPending ? (
        <Text className="px-4 py-3 text-sm text-muted-foreground">Loading attachments…</Text>
      ) : null}
      {query.error ? (
        <ErrorState
          compact
          error={query.error}
          noun="attachments"
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data?.map((file) => (
        <Row
          key={file.id}
          title={file.filename}
          subtitle={`${Math.ceil(file.size / 1024)} KB`}
          onPress={
            write.isPending
              ? undefined
              : () => {
                  setSelected(file.id);
                  setMenuOpen(true);
                }
          }
          chevron
        />
      ))}
      {query.data?.length === 0 ? (
        <Text className="px-4 py-3 text-sm text-muted-foreground">No attachments.</Text>
      ) : null}
      {write.isPending ? (
        <Text className="px-4 py-3 text-sm text-muted-foreground">Working…</Text>
      ) : null}
      {write.error ? (
        <View className="px-4 py-2">
          <MutationError error={write.error} />
        </View>
      ) : null}
      {attachment && menuOpen && !removing ? (
        <ActionSheet
          title={attachment.filename}
          onClose={() => setMenuOpen(false)}
          actions={[
            { label: "Save file", onPress: () => write.mutate("save") },
            ...(editable
              ? [
                  {
                    label: "Remove attachment",
                    destructive: true,
                    onPress: () => setRemoving(true),
                  },
                ]
              : []),
          ]}
        />
      ) : null}
      {attachment && removing ? (
        <ConfirmSheet
          title="Remove attachment?"
          description="This removes the file from this task."
          confirmLabel="Remove"
          destructive
          pending={write.isPending}
          error={write.error}
          onCancel={() => setRemoving(false)}
          onConfirm={() => write.mutate("remove")}
        />
      ) : null}
    </DetailSection>
  );
}
