import { attribute, attributeString, elementName, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

export const noPressedOutline: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Show a selected choice with SegmentedControl, not a pressed outline button.",
    },
    messages: {
      pressed: `An outline <{{component}}> with aria-pressed has no selected look, so people cannot tell which option is on once focus moves away. For one choice among 2–4 short options use <SegmentedControl> from "@/components/forms/segmented-control"; for a single on/off control use Toggle from "@/components/ui/toggle-group". ${see("1 Primitives")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const component = elementName(node.name);
        if (!component.endsWith("Button") || !attribute(node, "aria-pressed")) return;
        if (attributeString(node, "variant") !== "outline") return;
        context.report({ node, messageId: "pressed", data: { component } });
      },
    };
  },
};
