import type { MailAPI, MailScope } from "@substrate/contracts/mail/ipc";

import { createContext, useContext } from "react";

import type { LabelActions } from "./label-menu";
import type { ReaderActions } from "./reader-actions";

/** The mail bridge, scope and actions that every part of the inbox workspace shares. */
export type InboxWorkspaceValue = {
  api: MailAPI;
  scope: MailScope;
  labelActions: LabelActions;
  readerActions: ReaderActions;
};

export const InboxWorkspaceContext = createContext<InboxWorkspaceValue | null>(null);

export function useInboxWorkspace() {
  const context = useContext(InboxWorkspaceContext);
  if (!context) throw new Error("Inbox views must be rendered inside an InboxWorkspace.");
  return context;
}
