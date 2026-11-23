import * as React from "react";

import { cn } from "cn";

// Column layout from data attributes, so `AppTable` sets it without class names: `data-align="end"`
// right-aligns tabular figures and `data-hide-below` hides a column in a narrow container.
const tableColumnClasses =
  "data-[align=end]:text-right data-[align=end]:tabular-nums data-[hide-below=3xl]:hidden data-[hide-below=3xl]:@3xl:table-cell data-[hide-below=4xl]:hidden data-[hide-below=4xl]:@4xl:table-cell";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
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
        "data-[width=w-20]:w-20 data-[width=w-24]:w-24 data-[width=w-28]:w-28 data-[width=w-36]:w-36 data-[width=w-56]:w-56",
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
        // 36px rows: text cells py-2; cells with a control (button, select, avatar) py-1.
        "px-3 py-2 align-middle whitespace-nowrap has-[[role=checkbox]]:pr-0 data-controls:py-1",
        tableColumnClasses,
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell };
