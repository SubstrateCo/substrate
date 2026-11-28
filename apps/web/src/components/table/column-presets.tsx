import type { RowData } from "@tanstack/react-table";

import { dateTimeValue, type DateTimeInput } from "./date-time";
import { createAppColumnHelper } from "./table";

export function dateTimeColumn<TData extends RowData>(
  accessor: (row: TData) => DateTimeInput,
  { id, header }: { id: string; header: string },
) {
  return createAppColumnHelper<TData>().accessor((row) => dateTimeValue(accessor(row)), {
    id,
    header,
    meta: { width: "w-44" },
    sortFn: "basic",
    sortDescFirst: false,
    sortUndefined: "last",
    cell: ({ cell }) => <cell.DateTimeCell />,
  });
}
