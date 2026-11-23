import { ruleTester } from "../test-support.ts";
import { paneHeader } from "./pane-header.ts";

ruleTester.run("pane-header", paneHeader, {
  valid: [
    '<PageHeader variant="pane" title="Thread" />',
    // A calendar hour row: a border, but no inset or centered line.
    '<li aria-hidden="true" className="h-12 border-b border-border/60" />',
    '<div className="flex h-12 items-center px-4" />',
  ],
  invalid: [
    {
      code: '<header className="flex h-12 items-center gap-2 border-b px-4"><h2>Thread</h2></header>',
      errors: [{ messageId: "handBuilt" }],
    },
    {
      code: '<div className={cn("flex h-12 items-center", bordered && "border-b")} />',
      errors: [{ messageId: "handBuilt" }],
    },
  ],
});
