import { PictureUpload } from "@/components/upload/picture-upload";
import { usePictureMutations } from "@/queries/files/mutations";

export function AgentPicture({
  userId,
  agentId,
  name,
  image,
}: {
  userId: string;
  agentId: string;
  /** The agent's name, for the initials shown while it has no picture. */
  name: string;
  image: string | null;
}) {
  const { upload, remove } = usePictureMutations({ kind: "agent", userId, agentId });
  return (
    <PictureUpload
      kind="avatar"
      name={name}
      value={image}
      disabled={upload.isPending || remove.isPending}
      onUpload={async (file, context) => {
        await upload.mutateAsync({ file, ...context });
      }}
      onRemove={async () => {
        await remove.mutateAsync();
      }}
    />
  );
}
