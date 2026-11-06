import {
  mutationOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { pictureApi, type PictureKind } from "@/api/files";
import { queryKeys } from "@/queries/keys";

export function pictureMutationOptions(
  queryClient: QueryClient,
  kind: PictureKind,
  organizationId?: string,
  pictures = pictureApi,
) {
  const onSettled = async () => {
    if (kind === "avatar") {
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    } else {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.organizations }),
        queryClient.invalidateQueries({ queryKey: queryKeys.organization(organizationId!) }),
      ]);
    }
  };
  return {
    upload: mutationOptions({
      mutationFn: ({
        file,
        signal,
        onCommit,
      }: {
        file: File;
        signal?: AbortSignal;
        onCommit?: () => void;
      }) => pictures.uploadPicture(file, kind, signal, onCommit, organizationId),
      onSettled,
    }),
    remove: mutationOptions({
      mutationFn: () => pictures.removePicture(kind, organizationId),
      onSettled,
    }),
  };
}

export function usePictureMutations(kind: PictureKind, organizationId?: string) {
  const options = pictureMutationOptions(useQueryClient(), kind, organizationId);
  const upload = useMutation(options.upload);
  const remove = useMutation(options.remove);
  return { upload, remove };
}
