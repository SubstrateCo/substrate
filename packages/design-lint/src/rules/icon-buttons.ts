import {
  attribute,
  attributeString,
  type AstNode,
  elementName,
  enclosingElements,
  hasSpread,
  type NodeOf,
  possibleStrings,
  type Rule,
} from "../ast.ts";
import { see } from "../design-doc.ts";

const BUTTON = /(?:^|\.)\w*Button$/;
const NAME_ATTRIBUTES = ["aria-label", "aria-labelledby", "title"];
const TOOLTIP =
  '<Tooltip><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent>same words as aria-label</TooltipContent></Tooltip> from "@/components/ui/tooltip"';

type Element = NodeOf<"JSXElement">;

/** An icon-only button (`size="icon"`, `"icon-sm"`, ...) whose props this file can see. */
function iconButton(element: Element) {
  const opening = element.openingElement;
  const component = elementName(opening.name);
  if (!BUTTON.test(component) || hasSpread(opening) || attribute(opening, "asChild")) return;
  const size = attributeString(opening, "size");
  if (!size?.startsWith("icon")) return;
  return { component, size, label: attributeString(opening, "aria-label") };
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

/**
 * Text a sighted user can read on the button, such as a page number or an emoji in a span.
 * Screen-reader text is not.
 */
function hasVisibleText(children: Element["children"]): boolean {
  return children.some((child) => {
    if (child.type === "JSXText") return child.value.trim() !== "";
    if (child.type === "JSXElement") {
      return (
        elementName(child.openingElement.name) === "span" &&
        !isSrOnly(child) &&
        hasVisibleText(child.children)
      );
    }
    if (child.type !== "JSXExpressionContainer") return false;
    const expression = child.expression;
    return expression.type !== "JSXEmptyExpression" && expression.type !== "JSXElement";
  });
}

export const iconButtonName: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Give every icon-only button an accessible name." },
    messages: {
      missing: `Icon-only <{{component}} size="{{size}}"> has no accessible name, so screen readers announce only "button". Add aria-label with the action ("Delete agent", "New project"), and show the same words in ${TOOLTIP}. ${see("4 Icons, Action placement")}`,
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

function insideTooltipTrigger(node: AstNode) {
  for (const element of enclosingElements(node)) {
    const name = elementName(element.openingElement.name);
    if (name === "TooltipTrigger" || name === "Tooltip.Trigger") return true;
  }
  return false;
}

export const iconButtonTooltip: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Wrap icon-only buttons in a tooltip that names the action." },
    messages: {
      missing: `Icon-only <{{component}}>{{label}} has no tooltip, so sighted users have to guess what the icon does. Wrap it in ${TOOLTIP}. For a menu or popover trigger, put DropdownMenuTrigger asChild inside TooltipTrigger asChild. ${see("4 Icons, Action placement")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node) {
        const button = iconButton(node);
        if (!button || hasVisibleText(node.children) || insideTooltipTrigger(node)) return;
        context.report({
          node: node.openingElement,
          messageId: "missing",
          data: { component: button.component, label: button.label ? ` "${button.label}"` : "" },
        });
      },
    };
  },
};
