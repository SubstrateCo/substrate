import { claimSharingMail, finishSharingMail } from "@substrate/database/messaging";

import { db } from "../../auth/database";
import { mail } from "../../mail/service";
import { publishRefresh } from "../realtime/publisher";

let flushing: Promise<void> | undefined;
export function deliverSharingMail() {
  if (flushing) return flushing;
  flushing = (async () => {
    for (let i = 0; i < 30; i++) {
      const invitation = await claimSharingMail(db);
      if (!invitation) return;
      let sent = false;
      try {
        await mail.sharingInvitation(invitation.email, {
          id: invitation.id,
          organizationName: invitation.organizationName,
          conversationName: invitation.name,
        });
        sent = true;
      } catch {
        console.warn("Sharing invitation delivery failed; it will be retried.");
      }
      await publishRefresh(await finishSharingMail(db, invitation.id, invitation.attempt, sent));
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
