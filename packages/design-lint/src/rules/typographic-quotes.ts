import { possibleStrings, type NodeOf, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

// Props whose strings are read by people.
const COPY_ATTRIBUTES = new Set([
  "aria-label",
  "cancelLabel",
  "confirmLabel",
  "description",
  "emptyDescription",
  "emptyMessage",
  "errorDescription",
  "label",
  "pendingLabel",
  "placeholder",
  "title",
]);

const STRAIGHT_APOSTROPHE = /[\p{L}\p{N}]'[\p{L}\p{N}]/u;
const STRAIGHT_DOUBLE_QUOTES = /"[^"\n]+"/;

function straightQuote(text: string) {
  if (STRAIGHT_APOSTROPHE.test(text)) return "apostrophe";
  if (STRAIGHT_DOUBLE_QUOTES.test(text)) return "quotes";
  return undefined;
}

export const typographicQuotes: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Write apostrophes and quotation marks in user-facing copy as typed." },
    messages: {
      apostrophe: `This copy uses a straight apostrophe ('). Write the typographic one (’): "doesn’t", "Couldn’t load". Search and the notices already use it. ${see("7 Copy")}`,
      quotes: `This copy wraps words in straight quotes ("). Use curly quotes (“ ”): No results for “ro”. ${see("7 Copy")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXText(node: NodeOf<"JSXText">) {
        const messageId = straightQuote(node.value);
        if (messageId) context.report({ node, messageId });
      },
      JSXAttribute(node: NodeOf<"JSXAttribute">) {
        if (node.name.type !== "JSXIdentifier" || !COPY_ATTRIBUTES.has(node.name.name)) return;
        for (const { value, node: site } of possibleStrings(node.value)) {
          const messageId = straightQuote(value);
          if (messageId) context.report({ node: site, messageId });
        }
      },
    };
  },
};
