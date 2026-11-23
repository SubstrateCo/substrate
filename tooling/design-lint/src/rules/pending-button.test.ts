import { ruleTester } from "../test-support.ts";
import { pendingButton } from "./pending-button.ts";

ruleTester.run("pending-button", pendingButton, {
  valid: [
    "<PendingButton pending={saving}>Save</PendingButton>",
    // A toggle that changes meaning, not progress.
    '<Button>{open ? "Hide details" : "Show details"}</Button>',
    '<span className="sr-only">Loading messages</span>',
    '<Button aria-label={loading ? "Loading reference" : "Open reference"} />',
  ],
  invalid: [
    {
      code: '<Button type="submit" disabled={pending}>{pending ? "Saving" : "Save"}</Button>',
      errors: [{ messageId: "pending", data: { name: "pending" } }],
    },
    {
      code: '<Button>{mutation.isPending ? "Creating" : "Create deal"}</Button>',
      errors: [{ messageId: "pending", data: { name: "isPending" } }],
    },
    {
      code: '<p className="text-sm text-muted-foreground">Loading tasks</p>',
      errors: [{ messageId: "loading", data: { text: "Loading tasks" } }],
    },
    {
      code: '<div>{ready ? children : "Loading"}</div>',
      errors: [{ messageId: "loading", data: { text: "Loading" } }],
    },
  ],
});
