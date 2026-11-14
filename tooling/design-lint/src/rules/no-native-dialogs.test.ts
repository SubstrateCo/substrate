import { ruleTester } from "../test-support.ts";
import { noNativeDialogs } from "./no-native-dialogs.ts";

ruleTester.run("no-native-dialogs", noNativeDialogs, {
  valid: [
    // A local function named confirm is not the browser dialog.
    "async function confirm() { await save(); }\nconfirm();",
    "const confirm = useConfirm();\nconfirm();",
    "dialog.confirm();",
  ],
  invalid: [
    {
      code: 'if (!window.confirm("Delete routine?")) return;',
      errors: [
        {
          message:
            'window.confirm() opens the browser\'s dialog, which ignores the app theme, focus return, and copy rules. Use <ConfirmDialog> from "@/components/feedback/confirm-dialog": add destructive for delete, remove, leave, or disconnect, and a confirmLabel that names the object ("Delete conversation"). See apps/web/DESIGN.md § 1 Destructive flow.',
        },
      ],
    },
    {
      code: 'if (confirm("Delete?")) remove();',
      errors: [{ messageId: "confirm", data: { call: "confirm" } }],
    },
    {
      code: 'alert("Saved");',
      errors: [{ messageId: "other", data: { call: "alert" } }],
    },
    {
      code: 'const name = globalThis.prompt("Name");',
      errors: [{ messageId: "other", data: { call: "globalThis.prompt" } }],
    },
  ],
});
