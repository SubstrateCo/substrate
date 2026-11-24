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
      className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 @md:px-6"
    >
      {children}
    </div>
  );
}

export function TaskGroupHeaderLayout({ children }: { children: ReactNode }) {
  return (
    <div className="group/header flex h-9 items-center gap-1 border-b px-3 @md:px-6">
      {children}
    </div>
  );
}

export const taskRowClassName =
  "flex min-h-11 items-center gap-1 px-3 text-sm @md:h-9 @md:min-h-9 @md:pr-6 @md:pl-11";
export const taskRowContentClassName =
  "flex min-h-11 min-w-0 flex-1 items-center gap-2 py-1 pl-1 @md:h-full @md:min-h-0 @md:gap-3 @md:py-0";
export const taskRowDueDateClassName =
  "hidden w-16 shrink-0 justify-end text-xs text-muted-foreground @sm:flex";
export const taskRowAssigneeClassName = "ml-2 flex w-6 shrink-0 justify-center";
