import { ruleTester } from "../test-support.ts";
import { sentenceCase } from "./sentence-case.ts";

ruleTester.run("sentence-case", sentenceCase, {
  valid: [
    'export const a = <h2 className="text-xs font-medium text-muted-foreground">Not started</h2>;',
    'export const a = <span className="normal-case" />;',
  ],
  invalid: [
    {
      code: 'export const a = <h2 className="text-xs font-semibold tracking-wide uppercase">Not started</h2>;',
      errors: [
        {
          message:
            '"uppercase" changes the case of the text, so labels read as shouting or Title Case ("NOT STARTED", "High Priority") and no longer match the copy. Write the text in sentence case ("Not started", "No priority") and drop the class; small group labels use text-xs font-medium text-muted-foreground. See apps/web/DESIGN.md § 7 Copy.',
        },
      ],
    },
    {
      code: 'export const a = <span className={cn("text-xs", "capitalize")}>{priority}</span>;',
      errors: [{ messageId: "transform", data: { className: "capitalize" } }],
    },
  ],
});
