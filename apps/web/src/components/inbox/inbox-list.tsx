import {
  conversationKey,
  type Mailbox,
  type MailColor,
  type MailConversation,
} from "@substrate/contracts/mail";

import type { ComponentProps } from "react";

import type { FolderView } from "./mail-views";
import { SelectableMessageList } from "./selectable-message-list";
import { ContentNotice } from "@/components/feedback/content-notice";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { Mail, Search } from "lucide-react";

/** The message list, or the loading, connect, no-match or empty notice in its place. */
export function InboxList({
  accountsPending,
  pagePending,
  loadingMore,
  boxes,
  rows,
  listKey,
  colors,
  selected,
  unified,
  allTags,
  search,
  current,
  onOpen,
  onBeginSelection,
  onConnect,
  onManage,
  onChange,
  onClearSearch,
}: {
  accountsPending: boolean;
  pagePending: boolean;
  loadingMore: boolean;
  boxes: Mailbox[];
  rows: MailConversation[] | undefined;
  listKey: string;
  colors: ReadonlyMap<string, MailColor>;
  selected: MailConversation | undefined;
  unified: boolean;
  allTags: boolean;
  search: string;
  current: FolderView;
  onOpen: (message: MailConversation) => void;
  onBeginSelection: () => void;
  onConnect: () => void;
  onManage: () => void;
  onChange: ComponentProps<typeof SelectableMessageList>["onChange"];
  onClearSearch: () => void;
}) {
  if (accountsPending || (boxes.length && pagePending))
    return <LoadingState label="Reading local mail…" />;
  if (!boxes.length)
    return (
      <ContentNotice
        icon={Mail}
        title="Connect your first mailbox"
        description="Read your Gmail inbox on this device."
        action={<Button onClick={onConnect}>Connect Gmail</Button>}
      />
    );
  if (rows?.length)
    return (
      <SelectableMessageList
        key={listKey}
        messages={rows}
        mailboxes={boxes}
        colors={colors}
        selected={selected ? conversationKey(selected) : null}
        unified={unified}
        onOpen={onOpen}
        onBeginSelection={onBeginSelection}
        onManage={onManage}
        onChange={onChange}
        allTags={allTags}
      />
    );
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
