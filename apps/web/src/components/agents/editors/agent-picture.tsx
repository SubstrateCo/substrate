import { pictureMutationProps } from "@/components/upload/picture-mutation-props";
import { PictureUpload } from "@/components/upload/picture-upload";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { usePictureMutations } from "@/queries/files/mutations";
import { Pencil } from "lucide-react";

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
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Pressable aria-label="Edit agent picture" className="relative shrink-0">
              <Avatar variant="agent" className="size-14">
                {image && <AvatarImage src={image} alt="" />}
                <PersonAvatarFallback name={name} agent />
              </Avatar>
              <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-md border bg-background">
                <Pencil aria-hidden="true" className="size-3" />
              </span>
            </Pressable>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Edit agent picture</TooltipContent>
      </Tooltip>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Agent picture</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <PictureUpload
            kind="avatar"
            name={name}
            value={image}
            {...pictureMutationProps(mutations)}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
import { PersonAvatarFallback } from "@/components/people/person-avatar";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pressable } from "@/components/ui/pressable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
