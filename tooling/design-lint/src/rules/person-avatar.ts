import { attributeString, elementName, type NodeOf, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

export const personAvatar: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Draw small people and agent heads with PersonAvatar." },
    messages: {
      handBuilt: `A hand-built <Avatar size="sm"> with initials drifts from the other heads in shape and fill. Use <PersonAvatar name={...} agent={...} /> from "@/components/people/person-avatar": people are circles, agents rounded squares, both neutral. Larger heads (message authors, person cards, the user menu) stay <Avatar>. ${see("3 Shared building blocks")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node: NodeOf<"JSXElement">) {
        const opening = node.openingElement;
        if (elementName(opening.name) !== "Avatar" || attributeString(opening, "size") !== "sm")
          return;
        const hasFallback = node.children.some(
          (child) =>
            child.type === "JSXElement" &&
            elementName(child.openingElement.name) === "AvatarFallback",
        );
        if (hasFallback) context.report({ node: opening, messageId: "handBuilt" });
      },
    };
  },
};
