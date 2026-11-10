import { ruleTester } from "../test-support.ts";
import { destructiveLabel } from "./destructive-label.ts";

ruleTester.run("destructive-label", destructiveLabel, {
  valid: [
    '<DropdownMenuItem variant="destructive"><Trash2 /> Delete channel</DropdownMenuItem>',
    '<DropdownMenuItem variant="destructive"><LogOut /> Leave conversation</DropdownMenuItem>',
    // Not destructive: a plain "Remove" filter is out of scope.
    "<DropdownMenuItem>Delete</DropdownMenuItem>",
    '<ConfirmDialog title="Delete Launch plan?" confirmLabel="Delete project" />',
    "<ConfirmDialog title={title} confirmLabel={label} />",
  ],
  invalid: [
    {
      code: '<DropdownMenuItem variant="destructive"><Trash2 /> Delete</DropdownMenuItem>',
      errors: [{ messageId: "menu" }],
    },
    {
      code: '<DropdownMenuItem variant="destructive" onSelect={leave}>Leave</DropdownMenuItem>',
      errors: [{ messageId: "menu" }],
    },
    {
      code: '<ConfirmDialog title="Delete Launch plan?" confirmLabel="Delete" destructive />',
      errors: [{ messageId: "confirm" }],
    },
  ],
});
