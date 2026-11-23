import type { ReactNode } from "react";

export function ProjectHeaderLayout({ children }: { children: ReactNode }) {
  return <div className="shrink-0 border-b px-6 pt-6">{children}</div>;
}

export function ProjectTabLayout({ children }: { children: ReactNode }) {
  return <div className="mt-4 pb-1">{children}</div>;
}
