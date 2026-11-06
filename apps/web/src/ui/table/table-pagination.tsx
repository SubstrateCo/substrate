import type { RowData } from "@tanstack/react-table";

import { Fragment } from "react";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../primitives/pagination";
import { paginationPages } from "./pagination-pages";
import type { AppTableInstance } from "./table";

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
          <PaginationPrevious
            href="#"
            aria-disabled={!previous}
            tabIndex={previous ? undefined : -1}
            onClick={(event) => {
              event.preventDefault();
              if (previous) table.previousPage();
            }}
          />
        </PaginationItem>
        {pages.map((page, index) => (
          <Fragment key={page}>
            {index > 0 && page - pages[index - 1] > 1 && (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            )}
            <PaginationItem>
              <PaginationLink
                href="#"
                aria-label={`Go to page ${page + 1}`}
                isActive={page === pageIndex}
                onClick={(event) => {
                  event.preventDefault();
                  table.setPageIndex(page);
                }}
              >
                {page + 1}
              </PaginationLink>
            </PaginationItem>
          </Fragment>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            aria-disabled={!next}
            tabIndex={next ? undefined : -1}
            onClick={(event) => {
              event.preventDefault();
              if (next) table.nextPage();
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
