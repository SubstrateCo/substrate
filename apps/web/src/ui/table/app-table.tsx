import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { RowData } from "@tanstack/react-table";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { ContentNotice } from "../feedback/content-notice";
import { isAccessFailure } from "../feedback/request-failure";
import { Button } from "../primitives/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../primitives/table";
import { TablePagination } from "./table-pagination";
import type { AppTableInstance } from "./table";

export function AppTable<TData extends RowData>({
  table,
  name,
  loading = false,
  loadingMessage = "Loading…",
  error,
  onRetry,
  emptyMessage = "No results.",
  errorTitle = "Couldn’t load results",
  errorDescription = "Your results are unavailable. Please try again.",
}: {
  table: AppTableInstance<TData>;
  name: string;
  loading?: boolean;
  loadingMessage?: string;
  error?: Error | null;
  onRetry?: () => void;
  emptyMessage?: string;
  errorTitle?: string;
  errorDescription?: string;
}) {
  const rows = table.getRowModel().rows;
  const blocked = isAccessFailure(error);
  let emptyContent = (
    <ContentNotice title={emptyMessage} description="New items will appear here." />
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
      <div className="min-w-0 space-y-3">
        {loading && rows.length > 0 && !blocked && (
          <span role="status" className="sr-only">
            {loadingMessage}
          </span>
        )}
        {error && rows.length > 0 && !blocked && (
          <ErrorState compact title={errorTitle} description={errorDescription} onRetry={onRetry} />
        )}
        <div className="min-w-0 rounded-lg border">
          <Table aria-label={name} aria-busy={loading && !blocked}>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => {
                    const sorting = header.column.getIsSorted();
                    let Icon = ArrowUpDown;
                    let sortDirection: "ascending" | "descending" | "none" = "none";
                    if (sorting === "asc") {
                      Icon = ArrowUp;
                      sortDirection = "ascending";
                    } else if (sorting === "desc") {
                      Icon = ArrowDown;
                      sortDirection = "descending";
                    }
                    return (
                      <TableHead
                        key={header.id}
                        colSpan={header.colSpan}
                        aria-sort={header.column.getCanSort() ? sortDirection : undefined}
                      >
                        {!header.isPlaceholder &&
                          (header.column.getCanSort() ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              <table.FlexRender header={header} />
                              <Icon aria-hidden="true" />
                            </Button>
                          ) : (
                            <table.FlexRender header={header} />
                          ))}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {blocked || rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={table.getAllLeafColumns().length}>{emptyContent}</TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id}>
                        <table.AppCell cell={cell}>
                          {(boundCell) => <boundCell.FlexRender />}
                        </table.AppCell>
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {!blocked && rows.length > 0 && table.getPageCount() > 1 && (
          <TablePagination table={table} name={name} />
        )}
      </div>
    </table.AppTable>
  );
}
