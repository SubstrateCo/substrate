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

export type AppColumnMeta = {
  align?: "start" | "end";
  width?:
    | "w-20"
    | "w-24"
    | "w-25"
    | "w-28"
    | "w-36"
    | "w-44"
    | "w-56"
    | "w-[15%]"
    | "w-32 @min-[1081px]:w-64";
  hideBelow?: "@3xl" | "@4xl";
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

export type AppColumnDef<TData extends RowData> = ColumnDef<typeof features, TData, any>;
