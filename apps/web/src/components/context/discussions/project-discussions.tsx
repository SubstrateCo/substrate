import type { ReactNode } from "react";

export function ProjectDiscussions({ children }: { children: ReactNode }) {
  return (
    <details>
      <summary className="cursor-pointer text-sm">Project discussions</summary>
      {children}
    </details>
  );
}
