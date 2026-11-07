export function paginationPages(pageIndex: number, pageCount: number): number[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index);
  const start = Math.max(1, Math.min(pageIndex - 1, pageCount - 4));
  return [0, start, start + 1, start + 2, pageCount - 1];
}
