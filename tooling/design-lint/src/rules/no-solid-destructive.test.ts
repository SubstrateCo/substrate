import { ruleTester } from "../test-support.ts";
import { noSolidDestructive } from "./no-solid-destructive.ts";

ruleTester.run("no-solid-destructive", noSolidDestructive, {
  valid: [
    'export const a = <Button variant="destructive-ghost" size="icon-sm" aria-label="Delete agent" />;',
    // Destructive menu items and alerts are other components with their own red treatment.
    'export const a = <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>;',
    'export const a = <Alert variant="destructive" />;',
    'export const a = <ConfirmDialog destructive confirmLabel="Delete agent" />;',
  ],
  invalid: [
    {
      code: 'export const a = <Button variant="destructive" onClick={remove}>Delete agent</Button>;',
      errors: [
        {
          message:
            'variant="destructive" on <Button> is solid red, which is reserved for the confirm button inside ConfirmDialog so a filled red button always means "this is the last step". For the button that starts the action use variant="destructive-ghost" (quiet red; icon-only stays muted until hover), and confirm with <ConfirmDialog destructive confirmLabel="Delete agent"> from "@/components/feedback/confirm-dialog". See apps/web/DESIGN.md § 1 Destructive flow.',
          suggestions: [
            {
              messageId: "useGhost",
              output:
                'export const a = <Button variant="destructive-ghost" onClick={remove}>Delete agent</Button>;',
            },
          ],
        },
      ],
    },
    {
      code: 'export const a = <PendingButton variant={removing ? "destructive" : "outline"} />;',
      errors: [
        {
          messageId: "solid",
          data: { component: "PendingButton" },
          suggestions: [
            {
              messageId: "useGhost",
              output:
                'export const a = <PendingButton variant={removing ? "destructive-ghost" : "outline"} />;',
            },
          ],
        },
      ],
    },
  ],
});
