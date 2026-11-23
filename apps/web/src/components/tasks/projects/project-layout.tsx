import type { ReactNode } from "react";

export function ProjectHeaderLayout({ children }: { children: ReactNode }) {
  return <div className="shrink-0 border-b px-6 pt-5">{children}</div>;
}

export function ProjectTabLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pb-1">{children}</div>
  );
}
