import type { ReactNode, Ref } from "react";

import type { ProjectDetail } from "../../types";
import type { useProjectEditor } from "./use-project-editor";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Pencil } from "lucide-react";

export function ProjectSettings({
  detail,
  canEdit,
  editor,
  editButtonRef,
  renderEditor,
  renderSettings,
}: {
  detail: ProjectDetail;
  canEdit: boolean;
  editor: ReturnType<typeof useProjectEditor>["editor"];
  editButtonRef: Ref<HTMLButtonElement>;
  renderEditor: (detail: ProjectDetail, onDone: () => void) => ReactNode;
  renderSettings: (detail: ProjectDetail) => ReactNode;
}) {
  const { editing } = editor;
  return (
    <>
      {editing && canEdit && renderEditor(detail, editor.done)}
      <div hidden={editing && canEdit}>
        <div className="flex max-w-2xl min-w-0 flex-col items-start gap-4">
          {renderSettings(detail)}
          {canEdit && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={editButtonRef}
                  variant="outline"
                  size="icon"
                  aria-label="Edit project"
                  onClick={editor.edit}
                >
                  <Pencil aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit project</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </>
  );
}
