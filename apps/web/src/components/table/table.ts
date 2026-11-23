import {
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  metaHelper,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";

import { DateTimeCell } from "./date-time-cell";
import { NumberCell } from "./number-cell";
import { SortHeader } from "./sort-header";

/** Layout of one column. The classes are static, so Tailwind sees them. */
export type AppColumnMeta = {
  /** Amounts and counts are right-aligned with tabular figures. */
  align?: "start" | "end";
  width?: "w-20" | "w-24" | "w-28" | "w-36" | "w-44" | "w-56";
  /** Hide the column in a container narrower than this. */
  hideBelow?: "@3xl" | "@4xl";
  /** The cell holds a control (button, select), so it uses less vertical padding. */
  controls?: boolean;
};

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text },
  columnMeta: metaHelper<AppColumnMeta>(),
});

export const { useAppTable, createAppColumnHelper, useCellContext, useHeaderContext } =
  createTableHook({
    features,
    cellComponents: { DateTimeCell, NumberCell },
    headerComponents: { SortHeader },
  });

export type AppTableInstance<TData extends RowData> = ReturnType<typeof useAppTable<TData>>;

// oxlint-disable-next-line typescript/no-explicit-any -- Each column keeps its own value type.
export type AppColumnDef<TData extends RowData> = ColumnDef<typeof features, TData, any>;
