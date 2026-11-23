import {
  attribute,
  attributeString,
  elementName,
  hasSpread,
  type NodeOf,
  possibleStrings,
  type Rule,
} from "../ast.ts";
import { see } from "../design-doc.ts";

const BUTTON = /(?:^|\.)\w*Button$/;
const NAME_ATTRIBUTES = ["aria-label", "aria-labelledby", "title"];

type Element = NodeOf<"JSXElement">;

/** An icon-only button (`size="icon"`, `"icon-sm"`, ...) whose props this file can see. */
function iconButton(element: Element) {
  const opening = element.openingElement;
  const component = elementName(opening.name);
  if (!BUTTON.test(component) || hasSpread(opening) || attribute(opening, "asChild")) return;
  const size = attributeString(opening, "size");
  if (!size?.startsWith("icon")) return;
  return { component, size };
}

/** Visible or screen-reader text among the children, or an expression that may render text. */
function hasTextChild(children: Element["children"]): boolean {
  return children.some((child) => {
    if (child.type === "JSXText") return child.value.trim() !== "";
    if (child.type === "JSXExpressionContainer") {
      const expression = child.expression;
      return expression.type !== "JSXEmptyExpression" && expression.type !== "JSXElement";
    }
    if (child.type !== "JSXElement")
      return child.type === "JSXFragment" && hasTextChild(child.children);
    return (
      isSrOnly(child) ||
      (elementName(child.openingElement.name) === "span" && hasTextChild(child.children))
    );
  });
}

function isSrOnly(element: Element) {
  return possibleStrings(attribute(element.openingElement, "className")?.value).some((site) =>
    site.value.split(/\s+/).includes("sr-only"),
  );
}

export const iconButtonName: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Give every icon-only button an accessible name." },
    messages: {
      missing: `Icon-only <{{component}} size="{{size}}"> has no accessible name, so screen readers announce only "button". Add aria-label with the action ("Delete agent", "New project"). ${see("4 Icons, Action placement")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node) {
        const button = iconButton(node);
        if (!button) return;
        const named = NAME_ATTRIBUTES.some((name) => attribute(node.openingElement, name));
        if (named || hasTextChild(node.children)) return;
        context.report({
          node: node.openingElement,
          messageId: "missing",
          data: { component: button.component, size: button.size },
        });
      },
    };
  },
};
