import { ruleTester } from "../test-support.ts";
import { noRawValidationText } from "./no-raw-validation-text.ts";

ruleTester.run("no-raw-validation-text", noRawValidationText, {
  valid: [
    "const message = nativeValidationMessage({ validity: input.validity, label });",
    "const message = schemaIssueMessage(issue);",
    "const text = error.message;",
    "const text = message.body;",
  ],
  invalid: [
    {
      code: "export const a = <FieldError>{input.validationMessage}</FieldError>;",
      errors: [
        {
          message:
            'validationMessage is the browser\'s text ("Please fill out this field."), which ignores the field and changes with the OS language. Use nativeValidationMessage from "@/lib/forms/validation-messages" through NativeField ("@/components/forms/native-form") or useNativeValidation ("@/components/forms/use-native-validation"); pass missingMessage when "Enter <label>." reads badly. See apps/web/DESIGN.md § 2 Validation copy.',
        },
      ],
    },
    {
      code: "setError(event.currentTarget.validationMessage);",
      errors: [{ messageId: "browser" }],
    },
    {
      code: 'if (!input.success) setError(input.error.issues[0]?.message ?? "Check the routine.");',
      errors: [{ messageId: "schema" }],
    },
    {
      code: "const errors = result.error.issues.map((issue) => issue.message);",
      errors: [{ messageId: "schema" }],
    },
    {
      code: "const text = issues[0].message;",
      errors: [{ messageId: "schema" }],
    },
  ],
});
