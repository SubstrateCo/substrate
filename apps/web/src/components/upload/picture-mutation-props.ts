import type { PictureUploadProps } from "./picture-upload";
import type { usePictureMutations } from "@/queries/files/mutations";

type PictureMutations = Pick<ReturnType<typeof usePictureMutations>, "upload" | "remove">;

export function pictureMutationProps({
  upload,
  remove,
}: PictureMutations): Pick<
  PictureUploadProps,
  "uploading" | "uploadError" | "onUpload" | "removing" | "onRemove"
> {
  return {
    uploading: upload.isPending,
    uploadError: upload.error,
    onUpload: (input, options) => upload.mutate(input, options),
    removing: remove.isPending,
    onRemove: (options) => remove.mutate(undefined, options),
  };
}
