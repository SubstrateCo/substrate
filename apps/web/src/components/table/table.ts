import {
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  type RowData,
} from "@tanstack/react-table";

import { DateTimeCell } from "./date-time-cell";

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text },
});

export const { useAppTable, createAppColumnHelper, useCellContext } = createTableHook({
  features,
  cellComponents: { DateTimeCell },
});

export type AppTableInstance<TData extends RowData> = ReturnType<typeof useAppTable<TData>>;
