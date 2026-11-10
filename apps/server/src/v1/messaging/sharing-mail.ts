import { desktopPath } from "@startup-os/contracts/desktop/links";
import { claimSharingMail, finishSharingMail } from "@startup-os/database/messaging";

import { db } from "../../auth/database";
import { authEnvironment } from "../../auth/environment";
import { createMailer } from "../../auth/mail";
import { publishRefresh } from "../realtime/publisher";

let flushing: Promise<void> | undefined;
export function deliverSharingMail() {
  if (flushing) return flushing;
  flushing = (async () => {
    const env = authEnvironment();
    const send = createMailer(env);
    for (let i = 0; i < 30; i++) {
      const mail = await claimSharingMail(db);
      if (!mail) return;
      const link = new URL("/desktop/open", env.baseURL);
      link.searchParams.set("path", desktopPath.parse(`/accept-sharing/${mail.id}`));
      let sent = false;
      try {
        await send(
          mail.email,
          `Collaborate with ${mail.organizationName} on Startup OS`,
          `You have been invited to ${mail.name ?? "a conversation"}.\n\nAccept or decline:\n${link}\n\nAccepting shares the full conversation history. You can create an account and organization before installing the app.`,
        );
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
