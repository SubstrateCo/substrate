import { attribute, elementImport, stringValue, type AstNode, type Rule } from "../ast.ts";

function usableLabel(node: AstNode | null | undefined): boolean {
  if (!node) return false;
  const text = stringValue(node);
  if (text !== undefined) return text.trim().length > 0;
  if (node.type === "JSXExpressionContainer") return usableLabel(node.expression);
  if (node.type === "Literal") return false;
  if (node.type === "Identifier" && node.name === "undefined") return false;
  return true;
}

export const iconButtonName: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Give statically identifiable icon buttons a native accessible name." },
    schema: [],
    messages: {
      missing: "Give this icon button an accessibilityLabel that names its action.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const imported = elementImport(context, node);
        if (!imported || !/(?:^|\/)ui\/(?:button|icon-button)(?:\.[jt]sx?)?$/.test(imported.source))
          return;
        const iconOnly =
          imported.name === "IconButton" ||
          (imported.name === "Button" &&
            stringValue(attribute(node, "size")?.value)?.startsWith("icon"));
        if (
          !iconOnly ||
          node.attributes.some((item) => item.type === "JSXSpreadAttribute") ||
          attribute(node, "asChild")
        )
          return;
        if (
          usableLabel(attribute(node, "accessibilityLabel")?.value) ||
          usableLabel(attribute(node, "aria-label")?.value) ||
          usableLabel(attribute(node, "aria-labelledby")?.value) ||
          usableLabel(attribute(node, "accessibilityLabelledBy")?.value)
        )
          return;
        context.report({ node, messageId: "missing" });
      },
    };
  },
};
