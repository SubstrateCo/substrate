import { ruleTester } from "../test-support.ts";
import { selectedChoice } from "./selected-choice.ts";

ruleTester.run("selected-choice", selectedChoice, {
  valid: [
    '<label className="rounded-lg border has-[[data-state=checked]]:border-ring has-[[data-state=checked]]:bg-row-selected" />',
    // Other state classes are out of scope.
    '<label className="hover:bg-row-hover has-[[data-state=checked]]:text-foreground" />',
  ],
  invalid: [
    {
      code: '<label className="rounded-lg border has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-row-selected" />',
      errors: [
        { messageId: "token", data: { className: "has-[[data-state=checked]]:border-primary" } },
      ],
    },
    {
      code: '<label className="has-[[data-state=checked]]:border-ring has-[[data-state=checked]]:bg-accent" />',
      errors: [{ messageId: "token", data: { className: "has-[[data-state=checked]]:bg-accent" } }],
    },
  ],
});
