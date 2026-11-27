import { functionalUpdate, type RowData, type SortingState } from "@tanstack/react-table";

import { useMemo, useState, type ReactNode } from "react";

import { ContentNotice } from "../feedback/content-notice";
import { ErrorState } from "../feedback/error-state";
import { SkeletonText } from "../feedback/skeleton-text";
import {
  createAppColumnHelper,
  useAppTable,
  type AppColumnDef,
  type AppColumnMeta,
  type AppTableInstance,
} from "./table";
import { Pager, type PagerProps } from "./table-pagination";
import { RowActions } from "@/components/layout/row-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { cn } from "cn";
import type { LucideIcon } from "lucide-react";

/** The first column's link to the record. */
export const tableLink = "block truncate font-medium underline-offset-4 hover:underline";

/** The column layout as the data attributes that `ui/table` styles. */
function columnData(meta: AppColumnMeta | undefined, head = false) {
  return {
    "data-align": meta?.align,
    "data-hide-below": meta?.hideBelow?.slice(1),
    "data-controls": meta?.controls && !head ? "" : undefined,
    className: head ? meta?.width : undefined,
  };
}

export type AppTablePagination =
  /** Pages the rows in the browser. The pager shows from the second page. */
  | { mode: "client"; pageSize?: number }
  /** `data` is one page that the server returned. */
  | {
      mode: "server";
      pageIndex: number;
      pageSize: number;
      hasNextPage: boolean;
      /** A known total shows numbered pages; without it the pager shows "Page N". */
      rowCount?: number;
      onPageChange: (pageIndex: number) => void;
      /** If provided, the data source sorts the entire collection before returning this page. */
      sorting?: { value: SortingState; onChange: (next: SortingState) => void };
      pageSizeOptions?: number[];
      onPageSizeChange?: (pageSize: number) => void;
    };

type AppTableEmpty = {
  title: string;
  /** Where rows come from or how to add one, such as "Invitations you send appear here." */
  description: string;
  icon: LucideIcon;
  action?: ReactNode;
};

type AppTableProps<TData extends RowData> = {
  /** The table's accessible name, also used for its pager. */
  name: string;
  /** A dense, bounded grid with a pinned heading and first column for inspecting wide records. */
  layout?: "default" | "ledger";
  pageSummary?: string;
  /**
   * The table layout is fixed: columns take `meta.width`, the rest share the remaining space,
   * and long text truncates.
   */
  columns: AppColumnDef<TData>[];
  data: TData[];
  getRowId: (row: TData) => string;
  pagination?: AppTablePagination;
  /** The first load: the header and skeleton rows, shown after a short delay. */
  loading?: boolean;
  loadingMessage?: string;
  /** A later page is loading: the pager is disabled. */
  fetching?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  errorTitle?: string;
  empty: AppTableEmpty;
  /**
   * Icon row actions (`RowAction`). They add a trailing column and show on hover or focus. The
   * column is `w-20` (one action); pass `w-24` for two and `w-28` for three.
   */
  rowActions?: {
    label: (row: TData) => string;
    render: (row: TData) => ReactNode;
    width?: AppColumnMeta["width"];
  };
  selectedRowId?: string | null;
  onRowClick?: (row: TData) => void;
  /** A card per row below the container's `40rem` breakpoint. */
  renderMobileRow?: (row: TData) => ReactNode;
};

const defaultLoadingMessage = "Loading";
const defaultErrorTitle = "Couldn’t load results";

export function AppTable<TData extends RowData>({
  name,
  layout = "default",
  pageSummary,
  columns,
  data,
  getRowId,
  pagination = { mode: "client" },
  loading = false,
  loadingMessage = defaultLoadingMessage,
  fetching = false,
  error,
  onRetry,
  errorTitle = defaultErrorTitle,
  empty,
  rowActions,
  selectedRowId,
  onRowClick,
  renderMobileRow,
}: AppTableProps<TData>) {
  const table = usePagedTable({ columns, data, getRowId, pagination, rowActions });
  const rows = table.getRowModel().rows;
  const pager = pagerProps(table, name, pagination, fetching || loading);
  const parts = tableParts({ hasRows: rows.length > 0, loading, error, pager });
  const showLoading = useDelayedLoading(parts.initialLoading);
  const paginated = pagination.mode === "server" || table.getPageCount() > 1;
  return (
    <table.AppTable>
      <div
        className={cn(
          "@container min-w-0",
          layout === "ledger" ? "flex min-h-0 flex-col gap-2" : "space-y-3",
          paginated &&
            (parts.framed || parts.pager) &&
            // oxlint-disable-next-line shadcn/no-arbitrary-values -- Cap the stable results area to the window height so its pager stays reachable in short windows.
            "flex h-128 max-h-[60dvh] shrink-0 flex-col gap-3 space-y-0",
          !parts.framed && !parts.pager && "flex flex-1 flex-col space-y-0",
          parts.initialLoading && !showLoading && "invisible",
        )}
      >
        {parts.announceLoading && (
          <span role="status" className="sr-only">
            {loadingMessage}
          </span>
        )}
        {parts.inlineError && <ErrorState variant="compact" title={errorTitle} onRetry={onRetry} />}
        <div
          data-slot="table-results"
          role={paginated ? "region" : undefined}
          aria-label={paginated ? `${name} results` : undefined}
          tabIndex={paginated ? 0 : undefined}
          className={cn(
            "min-w-0",
            !parts.framed && "flex flex-1 flex-col",
            paginated && "min-h-0 flex-1 overflow-auto",
            paginated && parts.framed && "scrollbar-gutter-stable",
          )}
        >
          {parts.hasRows && renderMobileRow && (
            <MobileTableRows name={name} rows={rows} renderRow={renderMobileRow} />
          )}
          {parts.framed ? (
            <AppTableFrame
              table={table}
              name={name}
              layout={layout}
              loading={loading}
              initialLoading={parts.initialLoading}
              desktopOnly={parts.hasRows && !!renderMobileRow}
              selectedRowId={selectedRowId}
              onRowClick={onRowClick}
            />
          ) : (
            <AppTableNotice error={error} errorTitle={errorTitle} onRetry={onRetry} empty={empty} />
          )}
        </div>
        {parts.pager && <Pager {...parts.pager} summary={pageSummary} />}
      </div>
    </table.AppTable>
  );
}

/** Which parts of the table show for its rows, load state, error, and pager. */
function tableParts({
  hasRows,
  loading,
  error,
  pager,
}: {
  hasRows: boolean;
  loading: boolean;
  error?: Error | null;
  pager?: PagerProps;
}) {
  // The first load shows the header and skeleton rows.
  const initialLoading = loading && !hasRows && !error;
  return {
    hasRows,
    initialLoading,
    // With no rows, show only the notice, without the frame: sortable headers over nothing are noise.
    framed: hasRows || initialLoading,
    announceLoading: loading && (hasRows || initialLoading),
    // An error over rows that are still shown is a compact notice above them.
    inlineError: !!error && hasRows,
    // Page-size controls and the way back stay available through loading and empty results.
    pager,
  };
}

function AppTableNotice({
  error,
  errorTitle,
  onRetry,
  empty,
}: {
  error?: Error | null;
  errorTitle: string;
  onRetry?: () => void;
  empty: AppTableEmpty;
}) {
  if (error) return <ErrorState title={errorTitle} onRetry={onRetry} />;
  return <ContentNotice {...empty} />;
}

/** The table instance, with client paging state or the server page and sort it is given. */
function usePagedTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  pagination,
  rowActions,
}: Pick<AppTableProps<TData>, "columns" | "data" | "getRowId" | "rowActions"> & {
  pagination: AppTablePagination;
}) {
  const server = pagination.mode === "server";
  const sorting = server ? pagination.sorting : undefined;
  const [clientPage, setClientPage] = useState({
    pageIndex: 0,
    pageSize: pagination.pageSize ?? 25,
  });
  const allColumns = useMemo(() => withRowActions(columns, rowActions), [columns, rowActions]);
  const table = useAppTable({
    columns: allColumns,
    data,
    getRowId,
    autoResetPageIndex: false,
    manualPagination: server,
    enableSorting: !server || Boolean(sorting),
    ...(sorting && {
      manualSorting: true,
      enableMultiSort: false,
      enableSortingRemoval: false,
      onSortingChange: (update) => sorting.onChange(functionalUpdate(update, sorting.value)),
    }),
    state: {
      ...(sorting && { sorting: sorting.value }),
      pagination: server
        ? { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize }
        : clientPage,
    },
    onPaginationChange: server ? undefined : setClientPage,
  });
  // Removing the last row of the last page would leave an empty page with no pager to go back.
  const lastPage = Math.max(0, table.getPageCount() - 1);
  if (!server && clientPage.pageIndex > lastPage)
    setClientPage({ ...clientPage, pageIndex: lastPage });
  return table;
}

function AppTableFrame<TData extends RowData>({
  table,
  name,
  layout,
  loading,
  initialLoading,
  desktopOnly,
  selectedRowId,
  onRowClick,
}: {
  table: AppTableInstance<TData>;
  name: string;
  layout: NonNullable<AppTableProps<TData>["layout"]>;
  loading: boolean;
  /** Skeleton rows under headers that cannot sort yet. */
  initialLoading: boolean;
  /** Mobile cards replace the table below the container's `40rem` breakpoint. */
  desktopOnly: boolean;
  selectedRowId?: string | null;
  onRowClick?: (row: TData) => void;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border",
        layout === "ledger" && "flex min-h-0 overflow-hidden rounded-lg bg-card",
        desktopOnly && "hidden @min-[40rem]:block",
      )}
    >
      <Table aria-label={name} aria-busy={loading} layout={layout} className="min-w-xl table-fixed">
        <AppTableHeader table={table} sortable={!initialLoading} />
        <TableBody>
          {initialLoading ? (
            <SkeletonRows table={table} />
          ) : (
            <AppTableRows table={table} selectedRowId={selectedRowId} onRowClick={onRowClick} />
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function AppTableRows<TData extends RowData>({
  table,
  selectedRowId,
  onRowClick,
}: {
  table: AppTableInstance<TData>;
  selectedRowId?: string | null;
  onRowClick?: (row: TData) => void;
}) {
  return table.getRowModel().rows.map((row) => (
    <TableRow
      key={row.id}
      className={cn("group/row", onRowClick && "cursor-pointer")}
      data-state={row.id === selectedRowId ? "selected" : undefined}
      onClick={onRowClick && (() => onRowClick(row.original))}
    >
      {row.getAllCells().map((cell) => (
        <TableCell key={cell.id} {...columnData(cell.column.columnDef.meta)}>
          <table.AppCell cell={cell}>{(boundCell) => <boundCell.FlexRender />}</table.AppCell>
        </TableCell>
      ))}
    </TableRow>
  ));
}

const rowActionsColumn = "rowActions";

function withRowActions<TData extends RowData>(
  columns: AppColumnDef<TData>[],
  rowActions: AppTableProps<TData>["rowActions"],
): AppColumnDef<TData>[] {
  if (!rowActions) return columns;
  const column = createAppColumnHelper<TData>();
  return [
    ...columns,
    column.display({
      id: rowActionsColumn,
      header: () => <span className="sr-only">Actions</span>,
      meta: { align: "end", controls: true, width: rowActions.width ?? "w-20" },
      cell: ({ row }) => (
        <RowActions label={rowActions.label(row.original)} className="justify-end">
          {rowActions.render(row.original)}
        </RowActions>
      ),
    }),
  ];
}

/** The pager's state, or nothing while there is one page. */
function pagerProps<TData extends RowData>(
  table: AppTableInstance<TData>,
  name: string,
  pagination: AppTablePagination,
  fetching: boolean,
): PagerProps | undefined {
  if (pagination.mode === "client") {
    if (table.getPageCount() <= 1) return undefined;
    return {
      name,
      pageIndex: table.state.pagination.pageIndex,
      pageCount: table.getPageCount(),
      canPrevious: table.getCanPreviousPage(),
      canNext: table.getCanNextPage(),
      onPageChange: (pageIndex) => table.setPageIndex(pageIndex),
    };
  }
  const { pageIndex, pageSize, hasNextPage, rowCount } = pagination;
  // A page size choice stays reachable after someone picks a larger size.
  if (pageIndex === 0 && !hasNextPage && !pagination.pageSizeOptions) return undefined;
  return {
    name,
    pageIndex,
    pageCount: rowCount === undefined ? -1 : Math.ceil(rowCount / pageSize),
    canPrevious: pageIndex > 0,
    canNext: hasNextPage,
    onPageChange: pagination.onPageChange,
    disabled: fetching,
    pageSize,
    pageSizeOptions: pagination.pageSizeOptions,
    onPageSizeChange: pagination.onPageSizeChange,
  };
}

function AppTableHeader<TData extends RowData>({
  table,
  sortable,
}: {
  table: AppTableInstance<TData>;
  sortable: boolean;
}) {
  return (
    <TableHeader>
      {table.getHeaderGroups().map((group) => (
        <TableRow key={group.id}>
          {group.headers.map((header) => {
            const canSort = sortable && header.column.getCanSort();
            const sorting = header.column.getIsSorted();
            let sortDirection: "ascending" | "descending" | "none" = "none";
            if (sorting === "asc") sortDirection = "ascending";
            else if (sorting === "desc") sortDirection = "descending";
            return (
              <TableHead
                key={header.id}
                colSpan={header.colSpan}
                {...columnData(header.column.columnDef.meta, true)}
                aria-sort={canSort ? sortDirection : undefined}
              >
                {!header.isPlaceholder &&
                  (canSort ? (
                    <table.AppHeader header={header}>
                      {(boundHeader) => <boundHeader.SortHeader />}
                    </table.AppHeader>
                  ) : (
                    <table.FlexRender header={header} />
                  ))}
              </TableHead>
            );
          })}
        </TableRow>
      ))}
    </TableHeader>
  );
}

function SkeletonRows<TData extends RowData>({ table }: { table: AppTableInstance<TData> }) {
  return Array.from({ length: 3 }, (_, index) => (
    <TableRow key={index} aria-hidden="true">
      {table.getAllLeafColumns().map((column) => (
        <TableCell key={column.id} {...columnData(column.columnDef.meta)} data-controls={undefined}>
          {column.id !== rowActionsColumn && <SkeletonText width="70%" />}
        </TableCell>
      ))}
    </TableRow>
  ));
}

function MobileTableRows<TData extends RowData>({
  name,
  rows,
  renderRow,
}: {
  name: string;
  rows: { id: string; original: TData }[];
  renderRow: (row: TData) => ReactNode;
}) {
  return (
    <ul aria-label={name} className="space-y-3 @min-[40rem]:hidden">
      {rows.map((row) => (
        <li key={row.id} className="group/row min-w-0 space-y-3 rounded-lg border p-3">
          {renderRow(row.original)}
        </li>
      ))}
    </ul>
  );
}
