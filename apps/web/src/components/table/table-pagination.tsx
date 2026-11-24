import { Fragment } from "react";

import { Button } from "../ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "../ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { paginationPages } from "./pagination-pages";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type PagerProps = {
  /** Names the navigation, such as "Deals". */
  name: string;
  summary?: string;
  pageIndex: number;
  /** -1 when the total is unknown (cursor APIs): the pager shows "Page N". */
  pageCount: number;
  canPrevious: boolean;
  canNext: boolean;
  onPageChange: (pageIndex: number) => void;
  /** Disables the controls while a page loads. */
  disabled?: boolean;
  pageSize?: number;
  /** Shows "Rows per page" where the server supports page sizes. */
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
};

/** The one pager for tables, boards, and lists. Hide it while there is one page. */
export function Pager({
  name,
  summary,
  pageIndex,
  pageCount,
  canPrevious,
  canNext,
  onPageChange,
  disabled = false,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
}: PagerProps) {
  const known = pageCount >= 0;
  const pages = known ? paginationPages(pageIndex, pageCount) : [];
  return (
    <div className="@container flex min-w-0 flex-wrap items-center justify-end gap-3">
      {summary && (
        <span className="mr-auto text-xs text-muted-foreground tabular-nums">{summary}</span>
      )}
      {pageSize !== undefined && pageSizeOptions && onPageSizeChange && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(+value)}>
            <SelectTrigger aria-label="Rows per page" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Pagination aria-label={`${name} pagination`} className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PagerStep
              label="Previous page"
              disabled={disabled || !canPrevious}
              onClick={() => onPageChange(pageIndex - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </PagerStep>
          </PaginationItem>
          <PaginationItem className={known ? "@min-[28rem]:hidden" : undefined}>
            <span className="px-2 text-xs text-muted-foreground tabular-nums">
              Page {pageIndex + 1}
              {known && ` of ${pageCount}`}
            </span>
          </PaginationItem>
          {pages.map((page, index) => (
            <Fragment key={page}>
              {index > 0 && page - pages[index - 1] > 1 && (
                <PaginationItem className="hidden @min-[28rem]:block">
                  <PaginationEllipsis />
                </PaginationItem>
              )}
              <PaginationItem className="hidden @min-[28rem]:block">
                <Button
                  type="button"
                  variant={page === pageIndex ? "outline" : "ghost"}
                  size="icon"
                  aria-label={`Go to page ${page + 1}`}
                  aria-current={page === pageIndex ? "page" : undefined}
                  disabled={disabled}
                  onClick={() => onPageChange(page)}
                >
                  {page + 1}
                </Button>
              </PaginationItem>
            </Fragment>
          ))}
          <PaginationItem>
            <PagerStep
              label="Next page"
              disabled={disabled || !canNext}
              onClick={() => onPageChange(pageIndex + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </PagerStep>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

function PagerStep({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
