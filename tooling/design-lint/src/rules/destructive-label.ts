import { attributeString, elementName, type NodeOf, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

const MENU_ITEMS = new Set(["DropdownMenuItem", "ContextMenuItem"]);
const BARE = /^(delete|remove|leave|disconnect|discard|revoke|clear|archive|cancel|stop|ok|yes)$/i;

/** The words a menu item shows, ignoring icons and other elements. */
function ownText(element: NodeOf<"JSXElement">) {
  return element.children
    .flatMap((child) => (child.type === "JSXText" ? [child.value] : []))
    .join(" ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

export const destructiveLabel: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: 'Name the object in destructive actions: "Delete channel", not "Delete".',
    },
    messages: {
      menu: `This destructive menu item says only "{{label}}". Name the object so the menu reads on its own: "Delete channel", "Remove access", "Leave conversation". ${see("1 Destructive flow")}`,
      confirm: `This confirm button says only "{{label}}". Use a specific verb that names the object: "Delete conversation", "Remove Bob". ${see("1 Destructive flow")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node: NodeOf<"JSXElement">) {
        const opening = node.openingElement;
        if (!MENU_ITEMS.has(elementName(opening.name))) return;
        if (attributeString(opening, "variant") !== "destructive") return;
        const label = ownText(node);
        if (BARE.test(label)) context.report({ node, messageId: "menu", data: { label } });
      },
      JSXOpeningElement(node: NodeOf<"JSXOpeningElement">) {
        if (elementName(node.name) !== "ConfirmDialog") return;
        const label = attributeString(node, "confirmLabel");
        if (label && BARE.test(label.trim()))
          context.report({ node, messageId: "confirm", data: { label } });
      },
    };
  },
};
