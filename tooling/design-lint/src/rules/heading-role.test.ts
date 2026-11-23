import { ruleTester } from "../test-support.ts";
import { headingRole } from "./heading-role.ts";

ruleTester.run("heading-role", headingRole, {
  valid: [
    'export const a = <h3 className="text-sm font-semibold">Name</h3>;',
    'export const a = <h3 className="text-xs font-medium text-muted-foreground">Details</h3>;',
    'export const a = <h1 className={cn("font-semibold", page ? "text-xl" : "text-sm")} />;',
    // Only a size, or no class: the heading inherits its role from a wrapper such as CardTitle.
    'export const a = <h2 className="min-w-0">Home</h2>;',
    // Not a heading.
    'export const a = <p className="text-sm font-medium">Full name</p>;',
  ],
  invalid: [
    {
      code: 'export const a = <h2 className="text-sm font-medium">Column</h2>;',
      errors: [
        {
          messageId: "mismatch",
          data: { tag: "h2", size: "text-sm", weight: "font-medium" },
        },
      ],
    },
    {
      code: 'export const a = <h3 className={cn("flex-1 text-base", "font-normal")} />;',
      errors: [
        {
          messageId: "mismatch",
          data: { tag: "h3", size: "text-base", weight: "font-normal" },
        },
      ],
    },
  ],
});
