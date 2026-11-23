import { ruleTester } from "../test-support.ts";
import { elevation } from "./elevation.ts";

ruleTester.run("elevation", elevation, {
  valid: [
    'export const a = <div className="shadow-surface hover:shadow-raised" />;',
    'export const a = <div className={cn("shadow-floating", flat && "shadow-none")} />;',
    // Prose is not a class list.
    "export const a = <p>shadow-lg is gone</p>;",
  ],
  invalid: [
    {
      code: 'export const a = <div className="rounded-xl border shadow-sm" />;',
      errors: [{ messageId: "stock", data: { className: "shadow-sm" } }],
    },
    {
      code: 'export const a = <div className={cn("border", open && "hover:shadow-2xl")} />;',
      errors: [{ messageId: "stock", data: { className: "hover:shadow-2xl" } }],
    },
    {
      code: 'const panel = cn("shadow-[0_1px_2px_black]");',
      errors: [{ messageId: "stock", data: { className: "shadow-[0_1px_2px_black]" } }],
    },
  ],
});
