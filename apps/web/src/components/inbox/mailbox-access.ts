import type { Mailbox } from "@substrate/contracts/mail";

export const canChangeMail = (box: Mailbox) => box.canModify && box.status !== "reconnect";
