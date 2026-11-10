import { type AstNode, memberName, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

const ISSUE_NAMES = new Set(["issue", "issues", "firstIssue"]);

/** `issue.message`, `issues[0].message`, `error.issues[0]?.message`, and similar. */
function readsIssue(object: AstNode): boolean {
  if (object.type === "Identifier") return ISSUE_NAMES.has(object.name);
  if (object.type === "ChainExpression") return readsIssue(object.expression);
  if (object.type === "MemberExpression") {
    if (memberName(object) === "issues") return true;
    return object.computed && readsIssue(object.object);
  }
  return false;
}

export const noRawValidationText: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Show reviewed validation copy, not browser or schema-library text." },
    messages: {
      browser: `validationMessage is the browser's text ("Please fill out this field."), which ignores the field and changes with the OS language. Use nativeValidationMessage from "@/lib/forms/validation-messages" through NativeField ("@/components/forms/native-form") or useNativeValidation ("@/components/forms/use-native-validation"); pass missingMessage when "Enter <label>." reads badly. ${see("2 Validation copy")}`,
      schema: `A zod issue message is library text ("Too small: expected string to have >=1 characters"). Give the schema a field message, such as .min(1, "Enter a channel name."), and show it under the field in FieldError; schemaIssueMessage in "@/lib/forms/validation-messages" maps the rest. ${see("2 Validation copy")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        const name = memberName(node);
        if (name === "validationMessage") context.report({ node, messageId: "browser" });
        else if (name === "message" && readsIssue(node.object))
          context.report({ node, messageId: "schema" });
      },
    };
  },
};
