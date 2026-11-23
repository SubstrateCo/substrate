import { ruleTester } from "../test-support.ts";
import { guestCopy } from "./guest-copy.ts";

ruleTester.run("guest-copy", guestCopy, {
  valid: [
    "<Heading>Create a workspace</Heading>",
    // Routes and identifiers are not copy.
    '<AuthNavLink to="/organizations">Workspaces</AuthNavLink>',
    "const organizationId = organization.id;",
  ],
  invalid: [
    {
      code: "<Heading>Create an organization</Heading>",
      errors: [{ messageId: "organization", data: { text: "Create an organization" } }],
    },
    {
      code: '<Input aria-label="Organization name" />',
      errors: [{ messageId: "organization" }],
    },
    {
      code: '<p>{invited ? "Join the organization" : "Welcome"}</p>',
      errors: [{ messageId: "organization" }],
    },
  ],
});
