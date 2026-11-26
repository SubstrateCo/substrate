import { pictureMutationProps } from "@/components/upload/picture-mutation-props";
import { PictureUpload } from "@/components/upload/picture-upload";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { usePictureMutations } from "@/queries/files/mutations";

export function AgentPicture({
  agentId,
  name,
  image,
}: {
  agentId: string;
  /** The agent's name, for the initials shown while it has no picture. */
  name: string;
  image: string | null;
}) {
  const { userId } = useWorkspaceScope();
  const mutations = usePictureMutations({ kind: "agent", userId, agentId });
  return (
    <PictureUpload kind="avatar" name={name} value={image} {...pictureMutationProps(mutations)} />
  );
}
