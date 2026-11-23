import { ruleTester } from "../test-support.ts";
import { noOpacityTint } from "./no-opacity-tint.ts";

ruleTester.run("no-opacity-tint", noOpacityTint, {
  valid: [
    'export const a = <div className="bg-inset hover:bg-row-hover text-muted-foreground" />;',
    // Status dots, focus rings, and run-time colours are not tints of a surface.
    'export const a = <span className="bg-muted-foreground/60 ring-ring/50 bg-(--calendar-color)/15" />;',
    'export const a = <div className={cn("rounded-xl border", toneBorder.destructive)} />;',
  ],
  invalid: [
    {
      code: 'export const a = <div className="rounded-lg bg-muted/40 p-3" />;',
      errors: [{ messageId: "tint", data: { className: "bg-muted/40" } }],
    },
    {
      code: 'export const a = <div className={cn("border", danger && "border-destructive/30")} />;',
      errors: [{ messageId: "tint", data: { className: "border-destructive/30" } }],
    },
    {
      code: 'export const a = <span className="hover:text-foreground/80" />;',
      errors: [{ messageId: "tint", data: { className: "hover:text-foreground/80" } }],
    },
  ],
});
