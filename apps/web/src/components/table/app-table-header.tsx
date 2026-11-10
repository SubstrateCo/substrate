import type { RowData } from "@tanstack/react-table";

import { Button } from "../ui/button";
import { TableHead, TableHeader, TableRow } from "../ui/table";
import type { AppTableInstance } from "./table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export function AppTableHeader<TData extends RowData>({
  table,
}: {
  table: AppTableInstance<TData>;
}) {
  return (
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
  );
}
