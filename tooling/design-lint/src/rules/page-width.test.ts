import { ruleTester } from "../test-support.ts";
import { pageWidth } from "./page-width.ts";

ruleTester.run("page-width", pageWidth, {
  valid: [
    'export const a = <div className="mx-auto max-w-4xl space-y-6" />;',
    // A text measure, not a page column.
    'export const a = <p className="max-w-md text-sm" />;',
    'export const a = <span className="max-w-full truncate" />;',
  ],
  invalid: [
    {
      code: 'export const a = <div className="relative mx-auto max-w-2xl" />;',
      errors: [{ messageId: "width", data: { className: "max-w-2xl" } }],
    },
    {
      code: 'export const a = <div className={cn("w-full", "lg:max-w-6xl")} />;',
      errors: [{ messageId: "width", data: { className: "lg:max-w-6xl" } }],
    },
  ],
});
