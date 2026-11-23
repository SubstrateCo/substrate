import { ruleTester } from "../test-support.ts";
import { motion } from "./motion.ts";

ruleTester.run("motion", motion, {
  valid: [
    'export const a = <span className="motion-safe:animate-pulse ease-out" />;',
    'export const a = <span className="ease-in-out animate-spin" />;',
    // Prose is not a class list.
    "export const a = <p>animate-ping is gone</p>;",
    'const label = "ease-in";',
    'export const a = <span className="transition-[border-color,box-shadow] transition-transform" />;',
  ],
  invalid: [
    {
      code: 'export const a = <span className="absolute size-2 animate-ping rounded-full" />;',
      errors: [
        {
          message:
            '"animate-ping" never stops moving, so it pulls attention from the work on every screen it appears. Working is a soft motion-safe:animate-pulse dot and "needs you" is a steady dot: use <WorkIndicator tone="working" | "attention"> from "@/components/agent-work/work-indicator". See apps/web/DESIGN.md § 6 Motion.',
        },
      ],
    },
    {
      code: 'export const a = <span className={cn("size-2", attention && "motion-safe:animate-bounce")} />;',
      errors: [{ messageId: "attention", data: { className: "motion-safe:animate-bounce" } }],
    },
    {
      code: 'const panel = cva("transition", { variants: { open: { true: "duration-200 ease-in" } } });',
      errors: [{ messageId: "easeIn", data: { className: "ease-in" } }],
    },
    {
      code: 'export const a = <div className="transition-all duration-200" />;',
      errors: [{ messageId: "layout", data: { className: "transition-all" } }],
    },
    {
      code: 'export const a = <div className="transition-[opacity,height]" />;',
      errors: [{ messageId: "layout", data: { className: "transition-[opacity,height]" } }],
    },
  ],
});
