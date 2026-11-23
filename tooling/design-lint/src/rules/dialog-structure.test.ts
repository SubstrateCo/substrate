import { ruleTester } from "../test-support.ts";
import { dialogStructure } from "./dialog-structure.ts";

const imports =
  'import { DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui/dialog";\nimport { Button } from "@/components/ui/button";\n';

ruleTester.run("dialog-structure", dialogStructure, {
  valid: [
    `${imports}export const a = (
      <DialogContent>
        <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
        <form>
          <DialogBody>…</DialogBody>
          <DialogFooter><Button variant="outline">Cancel</Button><Button type="submit">Create task</Button></DialogFooter>
        </form>
      </DialogContent>
    );`,
    // The title may come from a component this file cannot see.
    `${imports}import { AgentForm } from "@/components/agents/editors/agent-form";\nexport const a = <DialogContent><AgentForm /></DialogContent>;`,
    // Submit buttons outside dialogs are out of scope.
    `${imports}export const a = <form><Button type="submit">Save</Button></form>;`,
  ],
  invalid: [
    {
      code: `${imports}export const a = <DialogContent><DialogBody>Body</DialogBody></DialogContent>;`,
      errors: [
        {
          message:
            '<DialogContent> has no DialogTitle, so screen readers announce an unnamed dialog and the close X has no title line to sit on. Start with <DialogHeader><DialogTitle>New task</DialogTitle><DialogDescription>…</DialogDescription></DialogHeader> from "@/components/ui/dialog".',
        },
      ],
    },
    {
      code: `${imports}export const a = <DialogContent><DialogTitle>New task</DialogTitle></DialogContent>;`,
      errors: [{ messageId: "titleOutsideHeader" }],
    },
    {
      code: `${imports}export const a = (
        <DialogContent>
          <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
          <DialogBody><Button type="submit">Create task</Button></DialogBody>
        </DialogContent>
      );`,
      errors: [{ messageId: "actionOutsideFooter" }],
    },
  ],
});
