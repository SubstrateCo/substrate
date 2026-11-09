import { AgentForm, type AgentFormProps } from "./agent-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AgentEditor({
  onClose,
  ...props
}: Omit<AgentFormProps, "onCancel" | "agent" | "picture"> & { onClose: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !props.pending) onClose();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create agent</DialogTitle>
          <DialogDescription>
            Name it and pick a model. Add skills, MCP servers, and triggers in its settings.
          </DialogDescription>
        </DialogHeader>
        <AgentForm {...props} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
