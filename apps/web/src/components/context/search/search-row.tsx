import type { ReactNode } from "react";

export const searchRowClass = "flex min-w-0 items-center gap-2 px-2 py-1.5 text-sm";

export function SearchRowFrame({ children }: { children: ReactNode }) {
  return <div className="px-1">{children}</div>;
}
