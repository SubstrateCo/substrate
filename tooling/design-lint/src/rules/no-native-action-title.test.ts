import { ruleTester } from "../test-support.ts";
import { noNativeActionTitle } from "./no-native-action-title.ts";

ruleTester.run("no-native-action-title", noNativeActionTitle, {
  valid: [
    '<span title="Full name">Name</span>',
    '<button aria-label="Copy link" />',
    'import { Button } from "another-library"; <Button title="Copy link" />;',
    'function Button() { return null; } <Button title="Copy link" />;',
    'import { Button } from "@/components/ui/button"; function View(Button) { return <Button title="Copy link" />; }',
  ],
  invalid: [
    {
      code: '<button title="Copy link" />',
      errors: [{ messageId: "title" }],
    },
    {
      code: "<button title={label} />",
      errors: [{ messageId: "title" }],
    },
    {
      code: 'import { Button as Action } from "@/components/ui/button"; <Action title="Copy link" />;',
      errors: [{ messageId: "title" }],
    },
    {
      code: 'import { Pressable } from "@/components/ui/pressable"; <Pressable title="Open task" />;',
      errors: [{ messageId: "title" }],
    },
    {
      code: 'import * as Menu from "../ui/dropdown-menu"; <Menu.DropdownMenuItem title="Delete task" />;',
      errors: [{ messageId: "title" }],
    },
    {
      code: 'import { DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu"; <DropdownMenuCheckboxItem title="Show archived" />;',
      errors: [{ messageId: "title" }],
    },
  ],
});
