import type { MailConversation } from "@substrate/contracts/mail";

import type { ReactNode } from "react";

import type { FolderView } from "../mail-views";
import { ContentNotice } from "@/components/feedback/content-notice";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { Mail, Search } from "lucide-react";

export function InboxList({
  accountsPending,
  pagePending,
  loadingMore,
  connected,
  rows,
  search,
  current,
  onConnect,
  onClearSearch,
  renderList,
}: {
  accountsPending: boolean;
  pagePending: boolean;
  loadingMore: boolean;
  connected: boolean;
  rows: MailConversation[] | undefined;
  search: string;
  current: FolderView;
  onConnect: () => void;
  onClearSearch: () => void;
  renderList: (rows: MailConversation[]) => ReactNode;
}) {
  if (accountsPending || (connected && pagePending))
    return <LoadingState label="Reading local mail…" />;
  if (!connected)
    return (
      <ContentNotice
        icon={Mail}
        title="Connect your first mailbox"
        description="Read your Gmail inbox on this device."
        action={<Button onClick={onConnect}>Connect Gmail</Button>}
      />
    );
  if (rows?.length) return renderList(rows);
  if (search)
    return (
      <ContentNotice
        icon={Search}
        title="No matching messages"
        description={`No match in ${current.label}.`}
        action={<Button onClick={onClearSearch}>Clear search</Button>}
      />
    );
  if (loadingMore) return <LoadingState label="Loading messages…" />;
  return <ContentNotice icon={current.icon} title={current.empty} description={current.hint} />;
}
