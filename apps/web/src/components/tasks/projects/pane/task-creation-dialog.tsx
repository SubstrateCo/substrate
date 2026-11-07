import { useRef, type ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function TaskCreationDialog({
  subtask,
  projectName,
  onCancel,
  onRestoreFocus,
  children,
}: {
  subtask: boolean;
  projectName: string;
  onCancel: () => void;
  onRestoreFocus: () => void;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const pending = () => !!content.current?.querySelector('form[aria-busy="true"]');
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending()) onCancel();
      }}
    >
      <DialogContent
        ref={content}
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (pending()) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (pending()) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <DialogTitle className="sr-only">{subtask ? "New subtask" : "New task"}</DialogTitle>
        <DialogDescription variant="context" className="min-w-0" title={projectName}>
          {projectName}
        </DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
