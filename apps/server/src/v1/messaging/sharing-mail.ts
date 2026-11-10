import { claimSharingMail, finishSharingMail } from "@startup-os/database/messaging";

import { db } from "../../auth/database";
import { mail as mailService } from "../../mail/service";
import { publishRefresh } from "../realtime/publisher";

let flushing: Promise<void> | undefined;
export function deliverSharingMail() {
  if (flushing) return flushing;
  flushing = (async () => {
    for (let i = 0; i < 30; i++) {
      const mail = await claimSharingMail(db);
      if (!mail) return;
      let sent = false;
      try {
        await mailService.sharingInvitation(mail.email, {
          id: mail.id,
          organizationName: mail.organizationName,
          conversationName: mail.name,
        });
        sent = true;
      } catch {
        console.warn("Sharing invitation delivery failed; it will be retried.");
      }
      await publishRefresh(await finishSharingMail(db, mail.id, mail.attempt, sent));
    }
  })()
    .catch(() =>
      console.warn("Sharing invitation delivery is unavailable; pending mail will be retried."),
    )
    .finally(() => {
      flushing = undefined;
    });
  return flushing;
}

export function startSharingMail() {
  void deliverSharingMail();
  const timer = setInterval(() => void deliverSharingMail(), 30_000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await flushing;
  };
}
