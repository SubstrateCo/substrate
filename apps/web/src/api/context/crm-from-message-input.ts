import type { CrmFromMessage } from "@substrate/contracts/crm/from-message";
import {
  accountFields,
  contactFields,
  dealFields,
  type CrmWrite,
} from "@substrate/contracts/crm/input";

export type MessageRecordDraft = Extract<
  CrmWrite,
  { action: "createAccount" | "createContact" | "createDeal" }
>;

export function messageRecordInput(
  messageId: string,
  requestId: string,
  draft: MessageRecordDraft,
): CrmFromMessage {
  const source = {
    organizationId: draft.organizationId,
    messageId,
    requestId,
    consentToRecordAudience: true as const,
    associate: false,
  };
  switch (draft.action) {
    case "createAccount":
      return { ...source, kind: "account", fields: accountFields.parse(draft) };
    case "createContact":
      return { ...source, kind: "contact", fields: contactFields.parse(draft) };
    case "createDeal":
      return { ...source, kind: "deal", fields: dealFields.parse(draft) };
  }
}
