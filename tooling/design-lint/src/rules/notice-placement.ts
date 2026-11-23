import {
  attribute,
  classTokens,
  elementName,
  enclosingElements,
  possibleStrings,
  type NodeOf,
  type Rule,
} from "../ast.ts";
import { see } from "../design-doc.ts";

const NOTICES = new Set(["ContentNotice", "ErrorState"]);
const FRAMES = new Set(["Card", "CardContent"]);
const CENTERING = new Set([
  "justify-center",
  "place-items-center",
  "place-content-center",
  "m-auto",
  "my-auto",
]);
const BORDERS = new Set(["border", "border-dashed"]);

export const noticePlacement: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Place notices directly in their region, without a centering wrapper or frame.",
    },
    messages: {
      frame: `<{{notice}}> sits in a <{{parent}}> frame. A notice brings its own placement: use variant="compact" in a card or section with its own heading, or variant="inline" in sheet sections, sidebar lists, and board columns, without an extra Card or border. ${see("3 Shared building blocks")}`,
      wrapper: `<{{notice}}> sits in a wrapper with "{{className}}". A notice places itself (centered horizontally, top-anchored below the header); remove the wrapper, or pick variant="compact" or "inline" for a smaller region. ${see("3 Shared building blocks")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node: NodeOf<"JSXOpeningElement">) {
        const notice = elementName(node.name);
        if (!NOTICES.has(notice)) return;
        // The first enclosing element is the notice itself.
        const parent = [...enclosingElements(node)][1]?.openingElement;
        if (!parent) return;
        const parentName = elementName(parent.name);
        if (FRAMES.has(parentName)) {
          context.report({ node, messageId: "frame", data: { notice, parent: parentName } });
          return;
        }
        const tokens = possibleStrings(attribute(parent, "className")?.value).flatMap((site) =>
          classTokens(site.value),
        );
        const offending = tokens.find(({ base }) => CENTERING.has(base) || BORDERS.has(base));
        if (offending)
          context.report({
            node,
            messageId: BORDERS.has(offending.base) ? "frame" : "wrapper",
            data: { notice, parent: parentName, className: offending.token },
          });
      },
    };
  },
};
