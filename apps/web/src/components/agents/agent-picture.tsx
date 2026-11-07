import { useMutation, useQueryClient } from "@tanstack/react-query";

import { setAgentPicture, uploadAgentPicture } from "@/api/agents";
import { queryKeys } from "@/queries/keys";
import { PictureUpload, type PictureUploadContext } from "@/ui/upload/picture-upload";

export function AgentPicture({
  userId,
  agentId,
  image,
}: {
  userId: string;
  agentId: string;
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
