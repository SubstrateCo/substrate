import { useMutation, useQueryClient } from "@tanstack/react-query";

import { setAgentPicture, uploadAgentPicture } from "@/api/agents/requests";
import type { PictureUploadContext } from "@/components/upload/image-crop-dialog";
import { PictureUpload } from "@/components/upload/picture-upload";
import { queryKeys } from "@/queries/keys";

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
  const client = useQueryClient();
  const onSettled = () => client.invalidateQueries({ queryKey: queryKeys.agents(userId) });
  const upload = useMutation({
    mutationFn: ({ file, signal, onCommit }: { file: File } & PictureUploadContext) =>
      uploadAgentPicture(agentId, file, signal, onCommit),
    onSettled,
  });
  const remove = useMutation({
    mutationFn: () => setAgentPicture(agentId, null),
    onSettled,
  });
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
