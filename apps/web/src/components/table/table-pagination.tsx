import type { RowData } from "@tanstack/react-table";

import { Fragment } from "react";

import { Button } from "../ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "../ui/pagination";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { paginationPages } from "./pagination-pages";
import type { AppTableInstance } from "./table";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function TablePagination<TData extends RowData>({
  table,
  name,
}: {
  table: AppTableInstance<TData>;
  name: string;
}) {
  const { pageIndex } = table.state.pagination;
  const pages = paginationPages(pageIndex, table.getPageCount());
  const previous = table.getCanPreviousPage();
  const next = table.getCanNextPage();
  return (
    <Pagination aria-label={`${name} pagination`}>
      <PaginationContent className="flex-wrap justify-center">
        <PaginationItem>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Previous page"
                disabled={!previous}
                onClick={() => table.previousPage()}
              >
                <ChevronLeft />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Previous page</TooltipContent>
          </Tooltip>
        </PaginationItem>
        <PaginationItem className="sm:hidden">
          <span className="px-2 text-sm text-muted-foreground">
            Page {pageIndex + 1} of {table.getPageCount()}
          </span>
        </PaginationItem>
        {pages.map((page, index) => (
          <Fragment key={page}>
            {index > 0 && page - pages[index - 1] > 1 && (
              <PaginationItem className="hidden sm:block">
                <PaginationEllipsis />
              </PaginationItem>
            )}
            <PaginationItem className="hidden sm:block">
              <Button
                type="button"
                variant={page === pageIndex ? "outline" : "ghost"}
                size="icon"
                aria-label={`Go to page ${page + 1}`}
                aria-current={page === pageIndex ? "page" : undefined}
                onClick={() => table.setPageIndex(page)}
              >
                {page + 1}
              </Button>
            </PaginationItem>
          </Fragment>
        ))}
        <PaginationItem>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Next page"
                disabled={!next}
                onClick={() => table.nextPage()}
              >
                <ChevronRight />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next page</TooltipContent>
          </Tooltip>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
