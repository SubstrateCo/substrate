import { ruleTester } from "../test-support.ts";
import { noDecorativeClass } from "./no-decorative-class.ts";

ruleTester.run("no-decorative-class", noDecorativeClass, {
  valid: [
    '<h2 className="text-xl font-medium" />',
    '<p className="text-xs font-medium text-muted-foreground" />',
    '<div className="shadow-raised hover:bg-row-hover active:scale-97 transition-colors" />',
    // A fade from one surface to transparent hints at more content.
    '<div className="sticky bottom-0 h-4 bg-linear-to-t from-popover to-transparent" />',
    '<div className="animate-pulse bg-muted" />',
    // Prose that happens to contain a class word is not a class list.
    '<p>{"Use uppercase letters"}</p>',
  ],
  invalid: [
    {
      code: '<h1 className="text-2xl font-bold" />',
      errors: [{ messageId: "heavy" }],
    },
    {
      code: 'const title = cn("text-sm", open && "font-semibold");',
      errors: [{ messageId: "semibold" }],
    },
    {
      code: '<h1 className="text-xl md:tracking-tight" />',
      errors: [{ messageId: "tracking" }],
    },
    {
      code: '<span className="text-xs uppercase text-muted-foreground" />',
      errors: [{ messageId: "uppercase" }],
    },
    {
      code: '<div className="bg-linear-to-r from-violet-500 to-blue-500" />',
      errors: [{ messageId: "gradient" }],
    },
    {
      // A coloured radial wash behind a page.
      code: '<main className="fixed inset-0 bg-radial from-accent to-transparent" />',
      errors: [{ messageId: "gradient" }],
    },
    {
      code: '<h1 className="bg-linear-to-r from-card to-transparent bg-clip-text text-transparent" />',
      errors: [{ messageId: "gradient" }],
    },
    {
      code: '<div className="shadow-lg shadow-primary/40" />',
      errors: [{ messageId: "glow" }],
    },
    {
      code: '<span className="drop-shadow-md" />',
      errors: [{ messageId: "glow" }],
    },
    {
      code: "const card = `rounded-xl ${tone} transition-all`;",
      errors: [{ messageId: "transitionAll" }],
    },
    {
      code: '<span className="animate-ping" />',
      errors: [{ messageId: "loop" }],
    },
    {
      code: '<div className="hover:scale-105" />',
      errors: [{ messageId: "hoverScale" }],
    },
  ],
});
