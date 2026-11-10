import { type AstNode, isRenderedChild, memberName, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

const ERROR_NAME = /^(?:error|err|e|cause|failure)$|Error$/;

function errorSource(object: AstNode): string | undefined {
  if (object.type === "Identifier") return ERROR_NAME.test(object.name) ? object.name : undefined;
  if (object.type === "ChainExpression") return errorSource(object.expression);
  const name = memberName(object);
  if (name && ERROR_NAME.test(name) && object.type === "MemberExpression") {
    const owner = object.object;
    const ownerName = owner.type === "Identifier" ? owner.name : (memberName(owner) ?? undefined);
    return ownerName ? `${ownerName}.${name}` : name;
  }
  return undefined;
}

function climb(node: AstNode): AstNode {
  let current = node;
  while (
    current.parent &&
    (current.parent.type === "ChainExpression" ||
      current.parent.type === "LogicalExpression" ||
      current.parent.type === "ConditionalExpression" ||
      current.parent.type === "TSNonNullExpression")
  ) {
    current = current.parent;
  }
  return current;
}

/** Rendered as JSX text, passed as a JSX prop, or sent to a toast. */
function isShown(node: AstNode) {
  if (isRenderedChild(node)) return true;
  const outer = climb(node);
  const parent = outer.parent;
  if (parent?.type === "JSXExpressionContainer" && parent.parent.type === "JSXAttribute")
    return true;
  if (
    parent?.type === "CallExpression" &&
    parent.arguments.some((argument) => argument === outer)
  ) {
    const callee = parent.callee;
    if (callee.type === "Identifier") return callee.name === "toast";
    return callee.type === "MemberExpression" && callee.object.type === "Identifier"
      ? callee.object.name === "toast"
      : false;
  }
  return false;
}

export const noRawErrorMessage: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Show reviewed error copy, not the raw text of a caught error." },
    messages: {
      raw: `{{source}}.message shows raw server or library text ("Request failed with status 409"). Pass the error to <FormMessage error={…} errorDescription="<what failed, in plain words>"> from "@/components/auth/form-message", or render actionErrorMessage({{source}}, "<specific fallback>") from "@/components/feedback/action-error-message" (also inside toast.error). ${see("1 Destructive flow")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (memberName(node) !== "message") return;
        const source = errorSource(node.object);
        if (source && isShown(node)) context.report({ node, messageId: "raw", data: { source } });
      },
    };
  },
};
