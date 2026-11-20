import type { ReactNode } from "react";

export function TaskFilterLayout({
  children,
  toolbar = false,
}: {
  children: ReactNode;
  toolbar?: boolean;
}) {
  return (
    <div
      role={toolbar ? "toolbar" : undefined}
      aria-label={toolbar ? "Task filters" : undefined}
      className="flex shrink-0 flex-wrap items-center gap-2 border-b px-6 py-2"
    >
      {children}
    </div>
  );
}

export function TaskGroupHeaderLayout({ children }: { children: ReactNode }) {
  return (
    <div className="group/header flex h-10 items-center gap-1 border-b pr-6 pl-4">{children}</div>
  );
}

export const taskRowClassName = "flex h-11 items-center gap-1 pr-6 pl-9 text-sm";
export const taskRowContentClassName = "flex h-full min-w-0 flex-1 items-center gap-3 pl-1";
export const taskRowDueDateClassName =
  "hidden w-16 shrink-0 justify-end text-xs text-muted-foreground @sm:flex";
export const taskRowAssigneeClassName = "ml-2 flex w-6 shrink-0 justify-center";
