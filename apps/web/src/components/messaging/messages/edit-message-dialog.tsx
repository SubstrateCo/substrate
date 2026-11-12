import { useState } from "react";

import type { Message } from "@/api/messaging/requests";
import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMessageMutations } from "@/queries/messaging/message-mutations";

export function EditMessageDialog({
  organizationId,
  message,
  onClose,
  onRestoreFocus,
}: {
  organizationId: string;
  message: Message;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  const [body, setBody] = useState(message.body);
  const { edit } = useMessageMutations(organizationId, message.conversationId, message.id);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !edit.isPending) onClose();
      }}
    >
      <DialogContent
        size="lg"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit message</DialogTitle>
          <DialogDescription>
            Update the text. Existing files and linked work will remain. Editing does not send new
            alerts.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Label htmlFor={`edit-${message.id}`}>Message</Label>
          <Textarea
            id={`edit-${message.id}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={20000}
            disabled={edit.isPending}
            autoFocus
          />
          <FormMessage
            error={edit.error}
            errorDescription="Your message couldn’t be updated. Try again."
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={edit.isPending} onClick={onClose}>
            Cancel
          </Button>
          <PendingButton
            pending={edit.isPending}
            pendingLabel="Saving…"
            disabled={body.trim() === message.body || (!body.trim() && !message.attachments.length)}
            onClick={() => edit.mutate(body.trim(), { onSuccess: onClose })}
          >
            Save message
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
