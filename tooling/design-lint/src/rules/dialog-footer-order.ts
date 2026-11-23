import {
  attribute,
  attributeString,
  elementName,
  type NodeOf,
  possibleStrings,
  type Rule,
} from "../ast.ts";

type Element = NodeOf<"JSXElement">;
type Child = Element["children"][number];
type Action = { element: Element; closes: boolean };

const BUTTON = /(?:^|\.)\w*Button$/;
const CLOSE = /^(?:DialogClose|DialogPrimitive\.Close)$/;
const PRIMARY_VARIANTS = new Set(["default", "destructive"]);

/** Buttons in the footer, in source order, looking through DialogClose and `cond && <Button />`. */
function actions(children: Child[], closes = false): Action[] {
  return children.flatMap((child): Action[] => {
    if (child.type === "JSXFragment") return actions(child.children, closes);
    if (child.type === "JSXExpressionContainer") {
      const expression = child.expression;
      if (expression.type === "LogicalExpression" && expression.right.type === "JSXElement")
        return actions([expression.right], closes);
      return [];
    }
    if (child.type !== "JSXElement") return [];
    const name = elementName(child.openingElement.name);
    if (CLOSE.test(name)) return actions(child.children, true);
    return BUTTON.test(name) ? [{ element: child, closes }] : [];
  });
}

function text(element: Element) {
  return element.children
    .map((child) => (child.type === "JSXText" ? child.value : ""))
    .join("")
    .trim();
}

function isCancel({ element, closes }: Action) {
  const variant = attributeString(element.openingElement, "variant");
  return closes || variant === "outline" || /^(?:Cancel|Close|Discard)$/.test(text(element));
}

function isPrimary({ element }: Action) {
  const opening = element.openingElement;
  if (attributeString(opening, "type") === "submit") return true;
  const variant = attribute(opening, "variant");
  if (!variant) return true;
  const values = possibleStrings(variant.value).map((site) => site.value);
  return values.length > 0 && values.every((value) => PRIMARY_VARIANTS.has(value));
}

export const dialogFooterOrder: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Put Cancel before the primary action in DialogFooter." },
    messages: {
      order:
        'In <DialogFooter>, Cancel comes after <{{primary}}>. Footers read Cancel (variant="outline") then the primary action, right-aligned, so the confirming button is always in the bottom-right corner. Move Cancel first; ConfirmDialog from "@/components/feedback/confirm-dialog" already does this.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node) {
        if (elementName(node.openingElement.name) !== "DialogFooter") return;
        const footer = actions(node.children);
        const primary = footer.findIndex((action) => !isCancel(action) && isPrimary(action));
        if (primary === -1) return;
        const lateCancel = footer.slice(primary + 1).find(isCancel);
        if (!lateCancel) return;
        context.report({
          node: lateCancel.element.openingElement,
          messageId: "order",
          data: { primary: elementName(footer[primary].element.openingElement.name) },
        });
      },
    };
  },
};
