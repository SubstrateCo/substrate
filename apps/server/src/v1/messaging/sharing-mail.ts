import { claimSharingMail, finishSharingMail } from "@substrate/database/messaging";
import type { Database } from "@substrate/database/trusted";

import type { MailService } from "../../mail/service";
import type { CommittedPublisher } from "../realtime/committed";
import { SharingMailWorker } from "./sharing-mail-worker";

export function createSharingMail(deps: {
  db: Database;
  mail: MailService;
  publish: CommittedPublisher;
}) {
  const { db, mail, publish: publishCommitted } = deps;
  const worker = new SharingMailWorker({
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

  function start() {
    const trigger = () => {
      void publishCommitted({ result: null, hints: [], mail: ["sharing"] });
    };
    trigger();
    const timer = setInterval(trigger, 30_000);
    timer.unref();
    return async () => {
      clearInterval(timer);
      await worker.idle();
    };
  }
  return { worker, start };
}
