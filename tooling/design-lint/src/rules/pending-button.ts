import {
  attribute,
  classTokens,
  elementName,
  enclosingElements,
  isRenderedChild,
  memberName,
  possibleStrings,
  type AstNode,
  type NodeOf,
  type Rule,
} from "../ast.ts";
import { see } from "../design-doc.ts";

const PENDING_NAME = /pending|saving|submitting|loading|busy/i;
const LOADING_TEXT = /^\s*Loading\b/;

function testName(node: AstNode): string | undefined {
  if (node.type === "Identifier") return node.name;
  if (node.type === "UnaryExpression") return testName(node.argument);
  return memberName(node);
}

/** Whether the text sits in a screen-reader-only element, where a loading label belongs. */
function screenReaderOnly(node: AstNode) {
  for (const element of enclosingElements(node)) {
    const className = attribute(element.openingElement, "className")?.value;
    const sites = possibleStrings(className);
    if (sites.some((site) => classTokens(site.value).some(({ base }) => base === "sr-only")))
      return true;
  }
  return false;
}

export const pendingButton: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Use PendingButton and LoadingState instead of swapping in progress text.",
    },
    messages: {
      pending: `This button swaps its label while {{name}} is true, so it changes width and reads as a different action. Use <PendingButton pending={...}> from "@/components/feedback/pending-button": it keeps the label and shows a spinner. ${see("7 Copy")}`,
      loading: `"{{text}}" is visible loading text. Show <LoadingState> from "@/components/feedback/loading-state" or a skeleton; the loading label is for screen readers only. ${see("7 Copy")}`,
    },
    schema: [],
  },
  create(context) {
    const reportLoading = (node: AstNode, text: string) => {
      if (LOADING_TEXT.test(text) && !screenReaderOnly(node))
        context.report({ node, messageId: "loading", data: { text: text.trim() } });
    };
    return {
      JSXElement(node: NodeOf<"JSXElement">) {
        const name = elementName(node.openingElement.name);
        if (name !== "Button" && name !== "button") return;
        for (const child of node.children) {
          if (child.type !== "JSXExpressionContainer") continue;
          const expression = child.expression;
          if (expression.type !== "ConditionalExpression") continue;
          const test = testName(expression.test);
          if (test && PENDING_NAME.test(test) && possibleStrings(expression).length > 0)
            context.report({ node: child, messageId: "pending", data: { name: test } });
        }
      },
      JSXText(node: NodeOf<"JSXText">) {
        reportLoading(node, node.value);
      },
      Literal(node: NodeOf<"Literal">) {
        // oxlint-disable-next-line deslop/no-runtime-typeof -- ESTree Literal values include strings, numbers, booleans, and null.
        if (typeof node.value === "string" && isRenderedChild(node))
          reportLoading(node, node.value);
      },
    };
  },
};
