import { claimSharingMail, finishSharingMail } from "@substrate/database/messaging";

import { db } from "../../auth/database";
import { mail } from "../../mail/service";
import { publishCommitted } from "../realtime/committed";
import { SharingMailWorker } from "./sharing-mail-worker";

export const sharingMailWorker = new SharingMailWorker({
  claim: async () => publishCommitted(await claimSharingMail(db)),
  send: (invitation) =>
    mail.sharingInvitation(invitation.email, {
      id: invitation.id,
      organizationName: invitation.organizationName,
      conversationName: invitation.name,
    }),
  finish: async (invitation, sent) => {
    await publishCommitted(await finishSharingMail(db, invitation.id, invitation.attempt, sent));
  },
  reportFailure: (message) => console.warn(message),
});

export function startSharingMail() {
  const trigger = () => {
    void publishCommitted({ result: null, hints: [], mail: ["sharing"] });
  };
  trigger();
  const timer = setInterval(trigger, 30_000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await sharingMailWorker.idle();
  };
}
