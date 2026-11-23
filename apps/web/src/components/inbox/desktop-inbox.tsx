import type { MailScope } from "@substrate/contracts/mail/ipc";

import { InboxWorkspace } from "./inbox-workspace";
import { ContentNotice } from "@/components/feedback/content-notice";
import { mailBridge } from "@/lib/desktop/bridges";
import { Laptop } from "lucide-react";

export function DesktopInbox({ scope }: { scope: MailScope }) {
  const api = mailBridge();
  if (!api)
    return (
      <ContentNotice
        title="Inbox lives on your desktop"
        description="Open the Substrate desktop app to read locally synced mail."
        icon={Laptop}
      />
    );
  return <InboxWorkspace api={api} scope={scope} />;
}
