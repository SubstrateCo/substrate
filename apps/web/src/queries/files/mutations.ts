import {
  mutationOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { setAgentPicture, uploadAgentPicture } from "@/api/agents/requests";
import { pictureApi } from "@/api/files/pictures";
import { setProjectPicture, uploadProjectPicture } from "@/api/tasks/requests";
import { queryKeys } from "@/queries/keys";

type PictureTarget =
  | { kind: "avatar" }
  | { kind: "organization-logo"; organizationId: string }
  | { kind: "agent"; userId: string; agentId: string }
  | { kind: "project"; organizationId: string; projectEntityId: string };

interface PictureUpload {
  file: File;
  signal?: AbortSignal;
  onCommit?: () => void;
}

export function pictureMutationOptions(
  queryClient: QueryClient,
  target: PictureTarget,
  pictures = pictureApi,
) {
  const onSettled = async () => {
    switch (target.kind) {
      case "avatar":
        await queryClient.invalidateQueries({ queryKey: queryKeys.session });
        return;
      case "organization-logo":
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.organizations }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.organizationDetail(target.organizationId),
          }),
        ]);
        return;
      case "agent":
        await queryClient.invalidateQueries({ queryKey: queryKeys.agents(target.userId) });
        return;
      case "project":
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.project(target.organizationId, target.projectEntityId),
          }),
          queryClient.invalidateQueries({ queryKey: queryKeys.projects(target.organizationId) }),
        ]);
    }
  };
  return {
    refresh: onSettled,
    upload: mutationOptions({
      mutationFn: async ({ file, signal, onCommit }: PictureUpload) => {
        switch (target.kind) {
          case "avatar":
            return pictures.uploadPicture(file, "avatar", signal, onCommit);
          case "organization-logo":
            return pictures.uploadPicture(
              file,
              "organization-logo",
              signal,
              onCommit,
              target.organizationId,
            );
          case "agent":
            return uploadAgentPicture(target.agentId, file, signal, onCommit);
          case "project":
            return uploadProjectPicture(
              target.organizationId,
              target.projectEntityId,
              file,
              signal,
              onCommit,
            );
        }
      },
      onSettled,
    }),
    remove: mutationOptions({
      mutationFn: async () => {
        switch (target.kind) {
          case "avatar":
            return pictures.removePicture("avatar");
          case "organization-logo":
            return pictures.removePicture("organization-logo", target.organizationId);
          case "agent":
            return setAgentPicture(target.agentId, null);
          case "project":
            return setProjectPicture(target.organizationId, target.projectEntityId, null);
        }
      },
      onSettled,
    }),
  };
}

export function usePictureMutations(target: PictureTarget) {
  const options = pictureMutationOptions(useQueryClient(), target);
  const upload = useMutation(options.upload);
  const remove = useMutation(options.remove);
  return { upload, remove, refresh: options.refresh };
}
