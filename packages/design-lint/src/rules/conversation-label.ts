import type { AstNode, NodeOf, Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

// "#" or "# " at the end of the text that comes before a conversation's name.
const HASH_BEFORE_NAME = /#\s?$/;
const NAME_EXPRESSION = /name/i;

export const conversationLabel: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: 'Write a conversation name through conversationLabel, not by hand with a "#".',
    },
    messages: {
      hash: `A "#" written before a name marks every channel public, including private ones, which show a lock and no "#". Use conversationLabel() for text, or <ConversationKindIcon> beside the bare name, from "@/lib/messaging/conversations" and "@/components/messaging/conversations/conversation-kind-icon". ${see("4 Icons")}`,
    },
    schema: [],
  },
  create(context) {
    const isName = (expression: AstNode) =>
      NAME_EXPRESSION.test(context.sourceCode.getText(expression));
    return {
      TemplateLiteral(node: NodeOf<"TemplateLiteral">) {
        for (const [index, quasi] of node.quasis.entries()) {
          const expression = node.expressions.at(index);
          if (expression && HASH_BEFORE_NAME.test(quasi.value.cooked ?? "") && isName(expression))
            context.report({ node: quasi, messageId: "hash" });
        }
      },
      JSXElement(node: NodeOf<"JSXElement">) {
        for (const [index, child] of node.children.entries()) {
          const next = node.children.at(index + 1);
          if (child.type !== "JSXText" || next?.type !== "JSXExpressionContainer") continue;
          if (HASH_BEFORE_NAME.test(child.value) && isName(next.expression))
            context.report({ node: child, messageId: "hash" });
        }
      },
    };
  },
};
