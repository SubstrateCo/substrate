import type { ReactNode } from "react";

export function ProjectDiscussions({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Messages linked to this project or its tasks. Open a discussion to return to its source
        conversation.
      </p>
      {children}
    </div>
  );
}
