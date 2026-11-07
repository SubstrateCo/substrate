import { useQuery } from "@tanstack/react-query";

import { PictureSettings } from "@/components/settings/profile/picture-settings";
import { sessionQueryOptions } from "@/queries/auth/session";
import { usePictureMutations } from "@/queries/files/mutations";

export function UserProfile() {
  const session = useQuery({ ...sessionQueryOptions(), staleTime: Infinity });
  const { upload, remove } = usePictureMutations("avatar");
  return (
    <PictureSettings
      title="Profile"
      loading={session.isPending}
      error={session.error}
      onRetry={() => void session.refetch()}
      kind="avatar"
      value={session.data?.user.image}
      disabled={session.isPending || upload.isPending || remove.isPending}
      onUpload={async (file, { signal, onCommit }) => {
        await upload.mutateAsync({ file, signal, onCommit });
      }}
      onRemove={async () => {
        await remove.mutateAsync();
      }}
    />
  );
}
