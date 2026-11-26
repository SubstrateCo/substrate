import { useState } from "react";

import type { Message } from "@/api/messaging/requests";
import { modalDialogProps } from "@/components/feedback/modal-dialog";
import { ReactionList } from "@/components/messaging/messages/reaction-list";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ReactionPeopleDialog({
  message,
  initialEmoji,
  onClose,
  restoreFocus,
}: {
  message: Message;
  initialEmoji: string;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const [emoji, setEmoji] = useState(initialEmoji);
  const modal = modalDialogProps({ onClose, onRestoreFocus: restoreFocus });
  return (
    <Dialog {...modal.root}>
      <DialogContent {...modal.content}>
        <DialogHeader>
          <DialogTitle>Reactions</DialogTitle>
          <DialogDescription>See who reacted to this message.</DialogDescription>
          <Tabs value={emoji} onValueChange={setEmoji} className="mt-2">
            <TabsList
              aria-label="Filter reactions"
              className="max-w-full justify-start overflow-x-auto"
            >
              <TabsTrigger value="">All</TabsTrigger>
              {message.reactions.map((reaction) => (
                <TabsTrigger
                  key={reaction.emoji}
                  value={reaction.emoji}
                  aria-label={`${reaction.emoji}, ${reaction.count}`}
                >
                  {reaction.emoji} <span className="text-muted-foreground">{reaction.count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </DialogHeader>
        <DialogBody>
          <ReactionList key={emoji} message={message} emoji={emoji || undefined} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
