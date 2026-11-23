import type { ReactNode } from "react";

import { useCellContext } from "./table";

const numberFormat = new Intl.NumberFormat();

/** A count or amount. Pair it with `meta: { align: "end" }`. */
export function NumberCell(): ReactNode {
  const value = useCellContext<number | null | undefined>().getValue();
  if (value == null)
    return (
      <span aria-label="No value" className="text-muted-foreground">
        -
      </span>
    );
  return <>{numberFormat.format(value)}</>;
}
