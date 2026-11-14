import { attribute, elementName, possibleStrings, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

const BUTTON = /(?:^|\.)\w*Button$/;

export const noSolidDestructive: Rule = {
  meta: {
    type: "problem",
    hasSuggestions: true,
    docs: { description: "Keep the solid red button for the confirm step of ConfirmDialog." },
    messages: {
      solid: `variant="destructive" on <{{component}}> is solid red, which is reserved for the confirm button inside ConfirmDialog so a filled red button always means "this is the last step". For the button that starts the action use variant="destructive-ghost" (quiet red; icon-only stays muted until hover), and confirm with <ConfirmDialog destructive confirmLabel="Delete agent"> from "@/components/feedback/confirm-dialog". ${see("1 Destructive flow")}`,
      useGhost: 'Use variant="destructive-ghost" and open a ConfirmDialog.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const component = elementName(node.name);
        if (!BUTTON.test(component)) return;
        const variant = attribute(node, "variant");
        for (const site of possibleStrings(variant?.value)) {
          if (site.value !== "destructive" || site.node.type !== "Literal") continue;
          const literal = site.node;
          context.report({
            node: literal,
            messageId: "solid",
            data: { component },
            suggest: [
              {
                messageId: "useGhost",
                fix: (fixer) => fixer.replaceText(literal, '"destructive-ghost"'),
              },
            ],
          });
        }
      },
    };
  },
};
