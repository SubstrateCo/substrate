import { ruleTester } from "../test-support.ts";
import { actionCopy } from "./action-copy.ts";

ruleTester.run("action-copy", actionCopy, {
  valid: [
    "<Button>Save</Button>",
    "<DialogTitle>New deal</DialogTitle>",
    '<DialogFooter><Button type="submit">Create deal</Button></DialogFooter>',
    // The trigger outside the dialog says "New".
    "<Button>New deal</Button>",
    // A domain verb that does not create.
    "<DialogTitle>Add calendars</DialogTitle>",
    "<p>Save this agent to see its local configuration.</p>",
    // Saves that name an object, not a settings card.
    "<PendingButton>Save picture</PendingButton>",
    '<Button type="submit">Save new password</Button>',
  ],
  invalid: [
    {
      code: "<Button>Save changes</Button>",
      errors: [{ messageId: "save", data: { label: "Save changes" } }],
    },
    {
      code: '<PendingButton pending={pending}>{pending ? "Save" : "Save run settings"}</PendingButton>',
      errors: [{ messageId: "save", data: { label: "Save run settings" } }],
    },
    {
      code: "<DialogTitle>Create a project</DialogTitle>",
      errors: [{ messageId: "title", data: { label: "Create a project" } }],
    },
    {
      code: '<DialogFooter><PendingButton type="submit">New agent</PendingButton></DialogFooter>',
      errors: [{ messageId: "submit", data: { label: "New agent" } }],
    },
  ],
});
