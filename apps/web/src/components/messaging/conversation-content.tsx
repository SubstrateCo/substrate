import type { ReactNode } from "react";

export function ConversationContent({ link, children }: { link: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-b px-4">{link}</div>
      {children}
    </div>
  );
}
