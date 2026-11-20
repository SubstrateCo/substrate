import type { RowData } from "@tanstack/react-table";

import type { ReactNode } from "react";

import { ContentNotice } from "../feedback/content-notice";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { SkeletonText } from "../feedback/skeleton-text";
import { Table, TableBody, TableCell, TableRow } from "../ui/table";
import { AppTableHeader } from "./app-table-header";
import type { AppTableInstance } from "./table";
import { TablePagination } from "./table-pagination";
import { actionRow } from "@/components/layout/row-actions";
import { cn } from "cn";
import type { LucideIcon } from "lucide-react";

type AppTableRows<TData extends RowData> = ReturnType<
  AppTableInstance<TData>["getRowModel"]
>["rows"];

export function AppTable<TData extends RowData>({
  table,
  name,
  loading = false,
  loadingMessage = "Loading…",
  error,
  onRetry,
  emptyMessage = "No results.",
  emptyDescription = "",
  emptyIcon,
  errorTitle = "Couldn’t load results",
  errorDescription = "Your results are unavailable. Please try again.",
  renderMobileRow,
}: {
  table: AppTableInstance<TData>;
  name: string;
  loading?: boolean;
  loadingMessage?: string;
  error?: Error | null;
  onRetry?: () => void;
  emptyMessage?: string;
  /** Where items come from or how to add one, such as "Invitations you send appear here." */
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  errorTitle?: string;
  errorDescription?: string;
  renderMobileRow?: (row: TData) => ReactNode;
}) {
  const rows = table.getRowModel().rows;
  // With no rows, show only the notice: sortable headers over nothing are noise.
  const hasRows = rows.length > 0;
  const initialLoading = loading && !hasRows && !error;
  let emptyContent = (
    <ContentNotice title={emptyMessage} description={emptyDescription} icon={emptyIcon} />
  );
  if (error) {
    emptyContent = (
      <ErrorState title={errorTitle} description={errorDescription} onRetry={onRetry} />
    );
  } else if (loading) {
    emptyContent = <LoadingState label={loadingMessage} variant="table" />;
  }
  return (
    <table.AppTable>
      <div className="@container min-w-0 space-y-3">
        {loading && (hasRows || initialLoading) && (
          <span
            role="status"
            className={cn(
              "sr-only",
              initialLoading && renderMobileRow && "hidden @min-[40rem]:block",
            )}
          >
            {loadingMessage}
          </span>
        )}
        {error && hasRows && (
          <ErrorState compact title={errorTitle} description={errorDescription} onRetry={onRetry} />
        )}
        {renderMobileRow && (
          <MobileTableRows name={name} rows={rows} renderRow={renderMobileRow}>
            {emptyContent}
          </MobileTableRows>
        )}
        <div
          className={cn(
            "min-w-0 rounded-lg border",
            renderMobileRow && "hidden @min-[40rem]:block",
          )}
        >
          {hasRows || loading ? (
            <Table aria-label={name} aria-busy={loading}>
              <AppTableHeader table={table} loading={initialLoading} />
              <AppTableBody table={table} rows={rows} loading={initialLoading}>
                {emptyContent}
              </AppTableBody>
            </Table>
          ) : (
            emptyContent
          )}
        </div>
        {hasRows && table.getPageCount() > 1 && <TablePagination table={table} name={name} />}
      </div>
    </table.AppTable>
  );
}

function MobileTableRows<TData extends RowData>({
  name,
  rows,
  renderRow,
  children,
}: {
  name: string;
  rows: AppTableRows<TData>;
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
            <li key={row.id} className={cn(actionRow, "min-w-0 space-y-3 rounded-lg border p-3")}>
              {renderRow(row.original)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AppTableBody<TData extends RowData>({
  table,
  rows,
  loading,
  children,
}: {
  table: AppTableInstance<TData>;
  rows: AppTableRows<TData>;
  loading: boolean;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <TableBody>
        {Array.from({ length: 3 }, (_, index) => (
          <TableRow key={index} aria-hidden="true">
            {table.getAllLeafColumns().map((column) => (
              <TableCell key={column.id}>
                <SkeletonText width="70%" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    );
  }
  return (
    <TableBody>
      {rows.length === 0 ? (
        <TableRow>
          <TableCell colSpan={table.getAllLeafColumns().length}>{children}</TableCell>
        </TableRow>
      ) : (
        rows.map((row) => (
          <TableRow key={row.id} className="group/row">
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id}>
                <table.AppCell cell={cell}>{(boundCell) => <boundCell.FlexRender />}</table.AppCell>
              </TableCell>
            ))}
          </TableRow>
        ))
      )}
    </TableBody>
  );
}
