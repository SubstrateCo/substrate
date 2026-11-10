import { elementName, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

// Radix items that mark their selected state with data-state.
const STATEFUL_ITEMS = new Set(["Toggle", "ToggleGroupItem"]);

export const noTooltipOnToggleItem: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Do not make a toggle item the tooltip trigger, which hides its selected state.",
    },
    messages: {
      clobbered: `<TooltipTrigger asChild> around <{{component}}> overwrites the item's data-state with "closed", so the chosen option loses its selected look. For a choice among 2–4 options use <SegmentedControl iconOnly> from "@/components/forms/segmented-control", which already wraps each item for its tooltip; otherwise put the trigger on a wrapping <span>. ${see("1 Primitives")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node) {
        if (elementName(node.openingElement.name) !== "TooltipTrigger") return;
        for (const child of node.children) {
          if (child.type !== "JSXElement") continue;
          const component = elementName(child.openingElement.name);
          if (STATEFUL_ITEMS.has(component))
            context.report({
              node: child.openingElement,
              messageId: "clobbered",
              data: { component },
            });
        }
      },
    };
  },
};
