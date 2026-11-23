import {
  attribute,
  attributeString,
  descendants,
  elementName,
  type NodeOf,
  type Rule,
} from "../ast.ts";
import { see } from "../design-doc.ts";

const BUTTON = /(?:^|\.)\w*Button$/;

export const recordSectionAction: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Give a record section one ghost icon action, not a labelled button." },
    messages: {
      labelled: `<{{component}}> is a labelled button in a record section's actions. The section action is one ghost icon-sm button with a tooltip: <RecordSectionAction label="Add contact"><Plus /></RecordSectionAction> from "@/components/layout/record-section". A choice goes in a SegmentedControl. ${see("3 Record sheets")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node: NodeOf<"JSXOpeningElement">) {
        if (elementName(node.name) !== "RecordSection") return;
        const actions = attribute(node, "actions")?.value;
        if (!actions) return;
        for (const child of descendants(context, actions)) {
          if (child.type !== "JSXOpeningElement") continue;
          const component = elementName(child.name);
          if (!BUTTON.test(component)) continue;
          // AttachFilesButton iconOnly is the shared attach control.
          if (attributeString(child, "size")?.startsWith("icon") || attribute(child, "iconOnly"))
            continue;
          context.report({ node: child, messageId: "labelled", data: { component } });
        }
      },
    };
  },
};
