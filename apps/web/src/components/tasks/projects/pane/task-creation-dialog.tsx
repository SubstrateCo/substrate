import { useRef, type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function TaskCreationDialog({
  projectName,
  parentTitle,
  subtask,
  onCancel,
  onRestoreFocus,
  children,
}: {
  projectName: string;
  /** The parent's title for a subtask, or undefined when the parent is not visible. */
  parentTitle?: string;
  subtask: boolean;
  onCancel: () => void;
  onRestoreFocus: () => void;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const pending = () => !!content.current?.querySelector('form[aria-busy="true"]');
  const place = subtask
    ? `In ${projectName}, under ${parentTitle ?? "a task you can’t open"}`
    : `In ${projectName}`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending()) onCancel();
      }}
    >
      <DialogContent
        ref={content}
        size="lg"
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
        <DialogHeader>
          <DialogTitle>{subtask ? "New subtask" : "New task"}</DialogTitle>
          <DialogDescription variant="context" className="min-w-0" title={place}>
            {place}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
