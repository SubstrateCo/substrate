import { bridgeOutput, type BridgeAPI } from "../desktop/ipc.ts";
import { userWorkspace } from "../workspace.ts";
import {
  mailColors,
  labelFilterModes,
  mailMessageActions,
  mailPageSize,
  mailViews,
  type MailBody,
  type Mailbox,
  type MailConversation,
  type MailHeader,
  type MailPage,
} from "./inbox.ts";
import { z } from "zod";

export const channel = "substrate:mail";
const workspaceMailbox = userWorkspace.extend({ mailboxId: z.string().min(1) });
const nickname = z.string().trim().max(80);
export type MailScope = z.output<typeof userWorkspace>;
const folder = z.object({
  mailboxId: z.string().nullable(),
  label: z.object({ mailboxId: z.string().min(1), id: z.string().min(1) }).optional(),
  view: z.enum(mailViews),
  search: z.string().max(500),
});
export type MailFolder = z.output<typeof folder>;
export type MailLabelFilter = NonNullable<MailFolder["label"]>;
const source = z.object({
  mailboxId: z.string().min(1),
  before: z.int().nonnegative(),
  token: z.string().min(1).max(8192).nullable(),
  through: z.int().nonnegative(),
});
export type MailPageSource = z.output<typeof source>;
const older = folder.extend({
  before: z.int().nonnegative(),
  seen: z.array(z.string()),
  /**
   * The timestamp of the last conversation shown. Every complete earlier page holds all cached
   * candidates newer than it, so a page starts there instead of walking back from `before`.
   */
  shownThrough: z.int().nonnegative().optional(),
  sources: z.array(source),
});
export type OlderMailQuery = z.output<typeof older>;
export type OlderMailPage = {
  items: MailConversation[];
  sources: MailPageSource[];
  hasMore: boolean;
  issue?: "reconnect" | "unavailable";
};
const labelDisplay = z.discriminatedUnion("area", [
  z.object({ area: z.literal("mailbox"), visible: z.boolean() }),
  z.object({
    area: z.literal("sidebar"),
    labelId: z.string().min(1),
    mode: z.enum(labelFilterModes),
  }),
  z.object({ area: z.literal("rows"), labelId: z.string().min(1), visible: z.boolean() }),
]);
export type LabelDisplayChange = z.output<typeof labelDisplay>;
const messageAction = {
  input: userWorkspace.extend({ id: z.uuid() }).strict(),
  output: z.enum(["updated", "missing", "reconnect", "retry"]),
};
export type MailActionResult = z.output<typeof messageAction.output>;
export const methods = {
  markRead: messageAction,
  markUnread: messageAction,
  trashMessage: messageAction,
  changeConversations: {
    input: userWorkspace
      .extend({
        ids: z.array(z.uuid()).min(1).max(mailPageSize),
        action: z.enum(mailMessageActions),
      })
      .strict(),
    output: z.array(z.strictObject({ id: z.uuid(), result: messageAction.output })),
  },
  accounts: {
    input: userWorkspace,
    output: bridgeOutput<Mailbox[]>(),
  },
  list: { input: userWorkspace.extend(folder.shape), output: bridgeOutput<MailPage>() },
  nextPage: { input: userWorkspace.extend(older.shape), output: bridgeOutput<OlderMailPage>() },
  thread: {
    input: userWorkspace.extend({ id: z.string().min(1) }),
    output: bridgeOutput<MailHeader[]>(),
  },
  body: {
    input: userWorkspace.extend({ id: z.string().min(1) }),
    output: bridgeOutput<MailBody | null>(),
  },
  picture: {
    input: userWorkspace.extend({ id: z.string().min(1), source: z.string().min(1).max(8192) }),
    output: z.string().nullable(),
  },
  connectGmail: {
    input: userWorkspace.extend({ nickname, chooseClient: z.boolean().optional() }),
    output: z.string().nullable(),
  },
  reconnectGmail: {
    input: workspaceMailbox.extend({ chooseClient: z.boolean().optional() }),
    output: z.enum(["connected", "different-account", "cancelled"]),
  },
  rename: { input: workspaceMailbox.extend({ nickname }) },
  labelColor: {
    input: workspaceMailbox.extend({
      labelId: z.string().min(1),
      color: z.enum(mailColors).nullable(),
    }),
  },
  labelVisibility: {
    input: workspaceMailbox.extend({ change: labelDisplay }),
  },
  disconnect: { input: workspaceMailbox },
  sync: { input: userWorkspace.extend({ mailboxId: z.string().nullable() }) },
};
export type MailAPI = BridgeAPI<typeof methods>;
