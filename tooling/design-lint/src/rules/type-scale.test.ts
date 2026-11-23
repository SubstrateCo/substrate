import { ruleTester } from "../test-support.ts";
import { typeScale } from "./type-scale.ts";

ruleTester.run("type-scale", typeScale, {
  valid: [
    'export const a = <p className="text-sm text-muted-foreground" />;',
    'export const a = <p className="text-sm/relaxed font-medium" />;',
    // Title roles are semibold, also when cn splits the size from the weight.
    'export const a = <h1 className={cn("font-semibold", page ? "text-xl tracking-tight" : "text-sm")} />;',
    'export const a = <h2 className="text-lg/snug font-semibold" />;',
    // A field keeps text-base on small screens so the page does not zoom.
    'export const a = <input className="text-base md:text-sm" />;',
    // A pill height set on purpose with a size other than its own default.
    'export const a = <span className="text-xs leading-5" />;',
  ],
  invalid: [
    {
      code: 'export const a = <a className="text-base font-medium hover:underline" />;',
      errors: [{ messageId: "size", data: { className: "text-base" } }],
    },
    {
      code: 'export const a = <span className="text-sm font-bold" />;',
      errors: [{ messageId: "weight", data: { className: "font-bold" } }],
    },
    {
      code: 'export const a = <span className="text-sm font-semibold tracking-wide" />;',
      errors: [{ messageId: "tracking", data: { className: "tracking-wide" } }],
    },
    {
      code: 'export const a = <p className={cn("text-sm", muted && "leading-5")} />;',
      errors: [{ messageId: "leading", data: { className: "leading-5", size: "text-sm" } }],
    },
  ],
});
