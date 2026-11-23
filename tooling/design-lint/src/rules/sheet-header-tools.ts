import { attribute, elementName, type AstNode, type NodeOf, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

const MAX_TOOLS = 3;

/** The tools an `actions` value renders side by side, or undefined when the file cannot see them. */
function countTools(node: AstNode): number | undefined {
  if (node.type === "JSXExpressionContainer") return countTools(node.expression);
  if (node.type === "JSXElement") return 1;
  if (node.type !== "JSXFragment") return undefined;
  return node.children.filter(
    (child) =>
      child.type === "JSXElement" ||
      (child.type === "JSXExpressionContainer" && child.expression.type !== "JSXEmptyExpression"),
  ).length;
}

export const sheetHeaderTools: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Keep at most three tools before Close in a record sheet header." },
    messages: {
      tooMany: `This sheet header shows {{count}} tools before Close. Keep at most ${MAX_TOOLS}, in this order: the primary edit (Pencil), Copy link, open elsewhere (ArrowUpRight), with one Ellipsis "More actions" menu among them; move the rest (Move, Share, Change owner) into the menu, with Archive or Restore last below a separator. ${see("3 Record sheets")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node: NodeOf<"JSXOpeningElement">) {
        if (elementName(node.name) !== "PageSheetHeader") return;
        const actions = attribute(node, "actions")?.value;
        const count = actions ? countTools(actions) : undefined;
        if (count !== undefined && count > MAX_TOOLS)
          context.report({ node, messageId: "tooMany", data: { count: String(count) } });
      },
    };
  },
};
