import { pictureMutationProps } from "@/components/upload/picture-mutation-props";
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
  const mutations = usePictureMutations({ kind: "agent", userId, agentId });
  return (
    <PictureUpload kind="avatar" name={name} value={image} {...pictureMutationProps(mutations)} />
  );
}
