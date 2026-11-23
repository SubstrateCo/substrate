import { ruleTester } from "../test-support.ts";
import { noEllipsis } from "./no-ellipsis.ts";

ruleTester.run("no-ellipsis", noEllipsis, {
  valid: [
    'export const a = <Input placeholder="Search workspace" />;',
    "export const a = <PendingButton pending={pending}>Save</PendingButton>;",
    // Spread and rest are code, and CSS truncation is not copy.
    'export const a = <Button {...props} className="truncate">Move</Button>;',
    "export const f = (...items: string[]) => [...items];",
    'export const a = <p className="[&_x]:p-2">Ready</p>;',
    'export const a = "path/.../file";',
  ],
  invalid: [
    {
      code: "export const a = <DropdownMenuItem>Move…</DropdownMenuItem>;",
      errors: [{ messageId: "ellipsis" }],
    },
    {
      code: "export const a = <p>Loading...</p>;",
      errors: [{ messageId: "ellipsis" }],
    },
    {
      code: 'export const a = <Input placeholder="Search workspace…" />;',
      errors: [{ messageId: "ellipsis" }],
    },
    {
      code: 'export const a = <LoadingState label="Loading events..." />;',
      errors: [{ messageId: "ellipsis" }],
    },
    {
      code: 'export const a = <Button aria-label={busy ? "Saving…" : "Save"} />;',
      errors: [{ messageId: "ellipsis" }],
    },
    {
      code: "export const a = <Search placeholder={`Search ${kind}…`} />;",
      errors: [{ messageId: "ellipsis" }],
    },
    {
      code: 'export const a = <Button>{stopping ? "Stopping..." : "Stop"}</Button>;',
      errors: [{ messageId: "ellipsis" }],
    },
    // Copy kept outside JSX.
    {
      code: 'export const status = () => "Checking linked work…";',
      errors: [{ messageId: "ellipsis" }],
    },
  ],
});
