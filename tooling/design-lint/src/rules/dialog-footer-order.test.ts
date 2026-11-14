import { ruleTester } from "../test-support.ts";
import { dialogFooterOrder } from "./dialog-footer-order.ts";

ruleTester.run("dialog-footer-order", dialogFooterOrder, {
  valid: [
    '<DialogFooter><Button variant="outline">Cancel</Button><Button type="submit">Save</Button></DialogFooter>',
    '<DialogFooter><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><PendingButton pending={p}>Save</PendingButton></DialogFooter>',
    '<DialogFooter><Button variant="outline">Cancel</Button>{confirmLabel && <PendingButton variant={destructive ? "destructive" : "default"}>{confirmLabel}</PendingButton>}</DialogFooter>',
    // Secondary actions after the primary are not Cancel.
    '<DialogFooter><Button variant="outline">Cancel</Button><Button>Save</Button><Button variant="ghost">Help</Button></DialogFooter>',
  ],
  invalid: [
    {
      code: '<DialogFooter><Button type="submit">Create agent</Button><Button variant="outline" onClick={onCancel}>Cancel</Button></DialogFooter>',
      errors: [
        {
          message:
            'In <DialogFooter>, Cancel comes after <Button>. Footers read Cancel (variant="outline") then the primary action, right-aligned, so the confirming button is always in the bottom-right corner. Move Cancel first; ConfirmDialog from "@/components/feedback/confirm-dialog" already does this. See apps/web/DESIGN.md § 1 Primitives (Footer order).',
        },
      ],
    },
    {
      code: '<DialogFooter><PendingButton pending={p}>Save</PendingButton><DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose></DialogFooter>',
      errors: [{ messageId: "order", data: { primary: "PendingButton" } }],
    },
  ],
});
