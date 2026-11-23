import { ruleTester } from "../test-support.ts";
import { radiusScale } from "./radius-scale.ts";

ruleTester.run("radius-scale", radiusScale, {
  valid: [
    'export const a = <div className="rounded-xl border" />;',
    'export const a = <span className="rounded-md rounded-t-lg rounded-full rounded-none" />;',
    "export const a = <p>A rounded square tile</p>;",
  ],
  invalid: [
    {
      code: 'export const a = <span className="rounded border px-1.5" />;',
      errors: [{ messageId: "offScale", data: { className: "rounded" } }],
    },
    {
      code: 'export const a = <div className={cn("border", big && "rounded-2xl")} />;',
      errors: [{ messageId: "offScale", data: { className: "rounded-2xl" } }],
    },
    {
      code: 'export const a = <div className="sm:rounded-tl-3xl" />;',
      errors: [{ messageId: "offScale", data: { className: "sm:rounded-tl-3xl" } }],
    },
  ],
});
