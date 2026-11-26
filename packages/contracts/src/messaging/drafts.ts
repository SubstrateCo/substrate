import type { PickedRecipient } from "../people/picker";

export type ConversationDraft = {
  name: string;
  recipients: PickedRecipient[];
  isPrivate: boolean;
  shareHistory: boolean;
};
