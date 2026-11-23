import { isRenderedChild, possibleStrings, type AstNode, type NodeOf, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

const ORGANIZATION = /\borgani[sz]ations?\b/i;
// Props whose strings are read by people.
const COPY_ATTRIBUTES = new Set([
  "title",
  "description",
  "label",
  "placeholder",
  "aria-label",
  "confirmLabel",
]);

export const guestCopy: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: 'Guest and onboarding pages say "workspace", not "organization".' },
    messages: {
      organization: `"{{text}}" says "organization" on a guest or onboarding page. People see a workspace here: write "workspace" ("Create a workspace", "Your workspaces"). ${see("7 Copy")}`,
    },
    schema: [],
  },
  create(context) {
    const check = (node: AstNode, text: string) => {
      if (ORGANIZATION.test(text))
        context.report({ node, messageId: "organization", data: { text: text.trim() } });
    };
    return {
      JSXText(node: NodeOf<"JSXText">) {
        check(node, node.value);
      },
      Literal(node: NodeOf<"Literal">) {
        // oxlint-disable-next-line deslop/no-runtime-typeof -- ESTree Literal values include strings, numbers, booleans, and null.
        if (typeof node.value === "string" && isRenderedChild(node)) check(node, node.value);
      },
      JSXAttribute(node: NodeOf<"JSXAttribute">) {
        if (node.name.type !== "JSXIdentifier" || !COPY_ATTRIBUTES.has(node.name.name)) return;
        for (const site of possibleStrings(node.value)) check(site.node, site.value);
      },
    };
  },
};
