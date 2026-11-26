import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import { View } from "react-native";

import { ProjectIcon } from "./project-icon";
import { recordRequests } from "@/features/records/requests";
import { taskApi } from "@/features/records/tasks/task-api";
import { projectPictureFile } from "@/features/records/tasks/task-file-helpers";
import { DetailSection, Row } from "@/features/records/ui/rows";
import { ConfirmSheet } from "@/features/records/ui/sheet";
import { MutationError } from "@/features/records/ui/states";
import { queryKeys, type QueryScope } from "@/queries/keys";
import * as ImagePicker from "expo-image-picker";

export function ProjectPicture({
  scope,
  projectId,
  image,
  editable,
}: {
  scope: QueryScope;
  projectId: string;
  image: string | null;
  editable: boolean;
}) {
  const client = useQueryClient();
  const [removing, setRemoving] = useState(false);
  const write = useMutation({
    retry: false,
    mutationFn: async (remove: boolean) => {
      if (!editable) throw new Error("This project is read-only.");
      let url = null;
      if (!remove) {
        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: false,
          quality: 0.8,
        });
        if (picked.canceled || !picked.assets[0]) return;
        const photo = projectPictureFile(picked.assets[0]);
        if (photo.size > 5 * 1024 * 1024) throw new Error("Use a picture up to 5 MB.");
        const result = await taskApi.picture(scope.organizationId, projectId, photo);
        url = result.url;
      }
      await recordRequests.mutateTasks({
        action: "setProjectPicture",
        organizationId: scope.organizationId,
        projectEntityId: projectId,
        image: url,
      });
    },
    onSuccess: async () => {
      setRemoving(false);
      await client.invalidateQueries({ queryKey: queryKeys.domain(scope, "tasks") });
    },
  });
  let pictureAction = image ? "Change picture" : "Add picture";
  if (write.isPending) pictureAction = "Saving picture…";
  return (
    <DetailSection title="Project picture">
      <Row
        title={pictureAction}
        subtitle={image ? "Project picture is set" : "No project picture"}
        trailing={<ProjectIcon scope={scope} image={image} large />}
        onPress={editable && !write.isPending ? () => write.mutate(false) : undefined}
      />
      {image && editable ? (
        <Row
          title="Remove picture"
          onPress={write.isPending ? undefined : () => setRemoving(true)}
        />
      ) : null}
      {write.error ? (
        <View className="px-4 py-2">
          <MutationError error={write.error} />
        </View>
      ) : null}
      {removing ? (
        <ConfirmSheet
          title="Remove project picture?"
          description="The project will use its default icon."
          confirmLabel="Remove"
          destructive
          pending={write.isPending}
          error={write.error}
          onCancel={() => setRemoving(false)}
          onConfirm={() => write.mutate(true)}
        />
      ) : null}
    </DetailSection>
  );
}
