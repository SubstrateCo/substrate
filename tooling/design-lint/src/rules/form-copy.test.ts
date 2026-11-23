import { ruleTester } from "../test-support.ts";
import { formCopy } from "./form-copy.ts";

ruleTester.run("form-copy", formCopy, {
  valid: [
    '<Input placeholder="For example: Launch plan" />',
    '<FieldLabel htmlFor="notes">Notes (optional)</FieldLabel>',
    "<FieldDescription>Shown to everyone in the channel.</FieldDescription>",
    '<Input type="search" placeholder="Search deals" />',
    '<Input type="search" placeholder={`Search ${collection}`} />',
    // Words that only contain the prefixes.
    '<Input placeholder="Example Corp" />',
    '<Input placeholder="Eggs and milk" />',
  ],
  invalid: [
    {
      code: '<Input placeholder="e.g. Launch plan" />',
      errors: [{ messageId: "example", data: { prefix: "e.g." } }],
    },
    {
      code: '<Textarea placeholder={draft ? "" : "Ex: follow up next week"} />',
      errors: [{ messageId: "example", data: { prefix: "Ex:" } }],
    },
    {
      code: '<NativeField label="Website" description="Optional. The company homepage." />',
      errors: [{ messageId: "optional" }],
    },
    {
      code: "<FieldDescription>A short summary (optional).</FieldDescription>",
      errors: [{ messageId: "optional" }],
    },
    {
      code: '<Input type="search" placeholder="Find a deal" />',
      errors: [{ messageId: "search", data: { placeholder: "Find a deal" } }],
    },
  ],
});
