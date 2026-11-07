import type { RowData } from "@tanstack/react-table";

import { Fragment } from "react";

import { Button } from "../primitives/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "../primitives/pagination";
import { paginationPages } from "./pagination-pages";
import type { AppTableInstance } from "./table";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

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
          <Button
            type="button"
            variant="ghost"
            aria-label="Go to previous page"
            disabled={!previous}
            onClick={() => table.previousPage()}
          >
            <ChevronLeftIcon />
            <span className="hidden sm:block">Previous</span>
          </Button>
        </PaginationItem>
        {pages.map((page, index) => (
          <Fragment key={page}>
            {index > 0 && page - pages[index - 1] > 1 && (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            )}
            <PaginationItem>
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
          <Button
            type="button"
            variant="ghost"
            aria-label="Go to next page"
            disabled={!next}
            onClick={() => table.nextPage()}
          >
            <span className="hidden sm:block">Next</span>
            <ChevronRightIcon />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
