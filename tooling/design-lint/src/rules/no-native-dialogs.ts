import { type AstNode, memberName, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

const NATIVE_DIALOGS = new Set(["confirm", "alert", "prompt"]);
const GLOBAL_OBJECTS = new Set(["window", "globalThis", "self"]);

export const noNativeDialogs: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Use the app's dialogs instead of the browser's confirm, alert, and prompt.",
    },
    messages: {
      confirm: `{{call}}() opens the browser's dialog, which ignores the app theme, focus return, and copy rules. Use <ConfirmDialog> from "@/components/feedback/confirm-dialog": add destructive for delete, remove, leave, or disconnect, and a confirmLabel that names the object ("Delete conversation"). ${see("1 Destructive flow")}`,
      other: `{{call}}() opens the browser's dialog, which ignores the app theme, focus return, and copy rules. Show the outcome inline with <FormMessage> from "@/components/feedback/form-message", ask for input in a Dialog form, or confirm with <ConfirmDialog> from "@/components/feedback/confirm-dialog". ${see("1 Destructive flow")}`,
    },
    schema: [],
  },
  create(context) {
    /** Whether the code declares the name itself, such as `async function confirm()`. */
    function declaredLocally(node: AstNode, name: string) {
      let scope: ReturnType<typeof context.sourceCode.getScope> | null =
        context.sourceCode.getScope(node);
      for (; scope; scope = scope.upper) {
        if (scope.set.get(name)?.defs.length) return true;
      }
      return false;
    }

    function nativeCall(callee: AstNode): string | undefined {
      if (callee.type === "Identifier") {
        return NATIVE_DIALOGS.has(callee.name) && !declaredLocally(callee, callee.name)
          ? callee.name
          : undefined;
      }
      const name = memberName(callee);
      if (!name || !NATIVE_DIALOGS.has(name) || callee.type !== "MemberExpression")
        return undefined;
      const object = callee.object;
      return object.type === "Identifier" && GLOBAL_OBJECTS.has(object.name)
        ? `${object.name}.${name}`
        : undefined;
    }

    return {
      CallExpression(node) {
        const call = nativeCall(node.callee);
        if (!call) return;
        context.report({
          node,
          messageId: call.endsWith("confirm") ? "confirm" : "other",
          data: { call },
        });
      },
    };
  },
};
