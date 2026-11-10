import type { ReactNode } from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import { Inbox, type LucideIcon } from "lucide-react";

/**
 * An empty or unavailable state. Pick an icon that names the situation, such as Unlink for a
 * broken link or MailX for a missing invitation, and give one labelled primary action at most.
 */
export function ContentNotice({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  description: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <Empty role="status" variant="pane" className="min-h-40">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          <h2>{title}</h2>
        </EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
