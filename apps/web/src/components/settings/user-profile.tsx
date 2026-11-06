import { useQuery } from "@tanstack/react-query";
import { PictureUpload } from "@startup-os/ui/upload/picture-upload";
import { Card, CardContent, CardHeader, CardTitle } from "@startup-os/ui/primitives/card";
import { sessionQueryOptions } from "@/queries/auth/session";
import { usePictureMutations } from "@/queries/files/mutations";

export function UserProfile() {
  const session = useQuery({ ...sessionQueryOptions(), staleTime: Infinity });
  const { upload, remove } = usePictureMutations("avatar");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <PictureUpload
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
      </CardContent>
    </Card>
  );
}
