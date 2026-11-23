import { attributeString, elementName, type NodeOf, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

const BUTTON = /(?:^|\.)\w*Button$/;

type Element = NodeOf<"JSXElement">;

const elementChildren = (element: Element) =>
  element.children.filter((child): child is Element => child.type === "JSXElement");

/**
 * Whether ArrowLeft always leads the button: a direct child, or a child of the link it renders
 * through `asChild`. An arrow behind a condition is a toggle, such as a mobile sidebar switch.
 */
function leadsWithArrowLeft(button: Element) {
  const children = elementChildren(button);
  const link = children.length === 1 ? children : [];
  return [...children, ...link.flatMap(elementChildren)].some(
    (child) => elementName(child.openingElement.name) === "ArrowLeft",
  );
}

export const backLink: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Use BackLink for labelled back navigation above a page header." },
    messages: {
      backLink: `This labelled button with ArrowLeft is hand-built back navigation. Use <BackLink><Link to="...">Deals</Link></BackLink> from "@/components/layout/page-header", directly above the PageHeader, so every back link has the same variant, size, and inset. ${see("3 Pages and settings")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node: Element) {
        const opening = node.openingElement;
        if (!BUTTON.test(elementName(opening.name))) return;
        // An icon-only back tool in a pane header is a different control.
        if (attributeString(opening, "size")?.startsWith("icon")) return;
        if (leadsWithArrowLeft(node)) context.report({ node: opening, messageId: "backLink" });
      },
    };
  },
};
