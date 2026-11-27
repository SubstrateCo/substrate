import type { FocusEventHandler, ReactNode, RefObject } from "react";

import { TaskInspectorActive } from "./task-inspector-context";
import { ContentNotice } from "@/components/feedback/content-notice";
import { PageSheet, PageSheetBody, PageSheetHeader } from "@/components/layout/page-sheet";
import { Unlink } from "lucide-react";

/** The task inspector sheet. Its `TaskDetail` child tracks drafts only while the sheet is open. */
export function TaskSheet({
  open,
  inspector,
  onFocusCapture,
  children,
  onClose,
}: {
  open: boolean;
  inspector?: RefObject<HTMLDivElement | null>;
  onFocusCapture?: FocusEventHandler<HTMLElement>;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <PageSheet
      open={open}
      label="Task"
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      ref={inspector}
      onFocusCapture={onFocusCapture}
    >
      <TaskInspectorActive.Provider value={open}>{children}</TaskInspectorActive.Provider>
    </PageSheet>
  );
}

export function UnavailableTask({ description }: { description: string }) {
  return (
    <>
      <PageSheetHeader title="Task" />
      <PageSheetBody className="flex flex-col">
        <ContentNotice icon={Unlink} title="Task unavailable" description={description} />
      </PageSheetBody>
    </>
  );
}
