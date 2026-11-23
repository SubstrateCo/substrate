import type { RowData } from "@tanstack/react-table";

import { useMemo, useState, type ReactNode } from "react";

import { ContentNotice } from "../feedback/content-notice";
import { ErrorState } from "../feedback/error-state";
import { SkeletonText } from "../feedback/skeleton-text";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  createAppColumnHelper,
  useAppTable,
  type AppColumnDef,
  type AppColumnMeta,
  type AppTableInstance,
} from "./table";
import { Pager, type PagerProps } from "./table-pagination";
import { RowActions } from "@/components/layout/row-actions";
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
    "data-width": head ? meta?.width : undefined,
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
      pageSizeOptions?: number[];
      onPageSizeChange?: (pageSize: number) => void;
    };

export type AppTableEmpty = {
  title: string;
  /** Where rows come from or how to add one, such as "Invitations you send appear here." */
  description: string;
  icon: LucideIcon;
  action?: ReactNode;
};

type AppTableProps<TData extends RowData> = {
  /** The table's accessible name, also used for its pager. */
  name: string;
  /** Column widths come from meta.width, and long text truncates. */
  layout?: "auto" | "fixed";
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
  errorDescription?: string;
  empty: AppTableEmpty;
  /** Icon row actions (`RowAction`). They add a trailing column and show on hover or focus. */
  rowActions?: { label: (row: TData) => string; render: (row: TData) => ReactNode };
  selectedRowId?: string | null;
  /** A card per row below the container's `40rem` breakpoint. */
  renderMobileRow?: (row: TData) => ReactNode;
};

const defaultLoadingMessage = "Loading…";
const defaultErrorTitle = "Couldn’t load results";
const defaultErrorDescription = "Your results are unavailable. Please try again.";

export function AppTable<TData extends RowData>({
  name,
  layout = "auto",
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
  errorDescription = defaultErrorDescription,
  empty,
  rowActions,
  selectedRowId,
  renderMobileRow,
}: AppTableProps<TData>) {
  const server = pagination.mode === "server";
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
    enableSorting: !server,
    state: {
      pagination: server
        ? { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize }
        : clientPage,
    },
    onPaginationChange: server ? undefined : setClientPage,
  });
  const rows = table.getRowModel().rows;
  // With no rows, show only the notice: sortable headers over nothing are noise.
  const hasRows = rows.length > 0;
  const initialLoading = loading && !hasRows && !error;
  const showLoading = useDelayedLoading(initialLoading);
  const pager = pagerProps(table, name, pagination, fetching);
  const notice = error ? (
    <ErrorState title={errorTitle} description={errorDescription} onRetry={onRetry} />
  ) : (
    <ContentNotice {...empty} />
  );
  return (
    <table.AppTable>
      <div
        className={cn(
          "@container min-w-0 space-y-3",
          initialLoading && !showLoading && "invisible",
        )}
      >
        {loading && (hasRows || initialLoading) && (
          <span role="status" className="sr-only">
            {loadingMessage}
          </span>
        )}
        {error && hasRows && (
          <ErrorState compact title={errorTitle} description={errorDescription} onRetry={onRetry} />
        )}
        {renderMobileRow && !initialLoading && (
          <MobileTableRows name={name} rows={rows} renderRow={renderMobileRow}>
            {notice}
          </MobileTableRows>
        )}
        <div
          className={cn(
            "min-w-0 rounded-xl border",
            renderMobileRow && !initialLoading && "hidden @min-[40rem]:block",
          )}
        >
          {hasRows || initialLoading ? (
            <Table
              aria-label={name}
              aria-busy={loading}
              className={layout === "fixed" ? "min-w-xl table-fixed" : undefined}
            >
              <AppTableHeader table={table} sortable={!initialLoading} />
              <TableBody>
                {initialLoading ? (
                  <SkeletonRows table={table} />
                ) : (
                  rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="group/row"
                      data-state={row.id === selectedRowId ? "selected" : undefined}
                    >
                      {row.getAllCells().map((cell) => {
                        const meta = cell.column.columnDef.meta;
                        return (
                          <TableCell key={cell.id} {...columnData(meta)}>
                            <table.AppCell cell={cell}>
                              {(boundCell) => <boundCell.FlexRender />}
                            </table.AppCell>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : (
            notice
          )}
        </div>
        {pager && (hasRows || pager.pageIndex > 0) && !initialLoading && <Pager {...pager} />}
      </div>
    </table.AppTable>
  );
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
      meta: { align: "end", controls: true },
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
  children,
}: {
  name: string;
  rows: { id: string; original: TData }[];
  renderRow: (row: TData) => ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 @min-[40rem]:hidden">
      {rows.length === 0 ? (
        children
      ) : (
        <ul aria-label={name} className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="group/row min-w-0 space-y-3 rounded-lg border p-3">
              {renderRow(row.original)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
