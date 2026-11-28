import * as React from "react";

import { cn } from "cn";

const tableColumnClasses =
  "data-[align=end]:text-right data-[align=end]:tabular-nums data-[hide-below=3xl]:hidden data-[hide-below=3xl]:@3xl:table-cell data-[hide-below=4xl]:hidden data-[hide-below=4xl]:@4xl:table-cell";

function Table({
  className,
  layout = "default",
  ...props
}: React.ComponentProps<"table"> & {
  layout?: "default" | "ledger";
}) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-auto"
      role={layout === "ledger" ? "region" : undefined}
      tabIndex={layout === "ledger" ? 0 : undefined}
      aria-label={layout === "ledger" ? `Scrollable ${props["aria-label"]} table` : undefined}
    >
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom",
          layout !== "ledger" && "text-sm",
          className,
          layout === "ledger" && [
            "min-w-207.5 border-separate border-spacing-0 text-compact",
            "[&_:is(th,td)]:border-r [&_:is(th,td)]:border-b [&_:is(th,td)]:border-r-border/60 [&_:is(th,td)]:px-2.5 [&_:is(th,td):last-child]:border-r-0 [&_tbody_tr:last-child_td]:border-b-0",
            "[&_th]:sticky [&_th]:top-0 [&_th]:z-2 [&_th]:bg-sidebar [&_th:first-child]:left-0 [&_th:first-child]:z-3 [&_th[aria-sort=ascending]]:text-foreground [&_th[aria-sort=descending]]:text-foreground",
            "[&_tbody_tr]:bg-card [&_tbody_tr:focus-within]:bg-inset [&_tbody_tr:hover]:bg-inset [&_tbody_tr:nth-child(even)]:bg-surface [&_tbody_tr[data-state=selected]]:bg-row-selected [&_tbody_tr[data-state=selected]]:text-row-selected-foreground",
            "[&_tbody_td]:h-9 [&_tbody_td]:bg-inherit [&_tbody_td]:py-0 [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:z-1 [&_tbody_tr[data-state=selected]_td:first-child]:before:absolute [&_tbody_tr[data-state=selected]_td:first-child]:before:inset-y-0 [&_tbody_tr[data-state=selected]_td:first-child]:before:left-0 [&_tbody_tr[data-state=selected]_td:first-child]:before:w-0.75 [&_tbody_tr[data-state=selected]_td:first-child]:before:bg-primary",
            "@max-[520px]:[&_tbody_td]:h-10 @max-[650px]:[&_th:first-child]:w-48 @max-[375px]:[&_th:first-child]:w-36",
          ],
        )}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-row-hover has-aria-expanded:bg-row-hover data-[state=selected]:bg-row-selected",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground has-[[role=checkbox]]:pr-0",
        tableColumnClasses,
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2 align-middle whitespace-nowrap has-[[role=checkbox]]:pr-0 data-controls:py-1",
        tableColumnClasses,
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell };
