import { classListVisitors, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

const LARGE_SIZE = /^text-(?:base|lg|xl|[2-9]xl)(?:\/.+)?$/;
const OFF_WEIGHT = /^font-(?:thin|extralight|light|bold|extrabold|black|\[.+\])$/;
const DEFAULT_LEADING: Record<string, string> = { "text-sm": "leading-5", "text-xs": "leading-4" };
const SECTION = see("1 Type and radius");

export const typeScale: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Use the type roles: sizes, weights, tracking, and leading." },
    messages: {
      size: `"{{className}}" is larger than body text outside a title role. Titles are semibold: page text-xl, record name text-lg/snug, settings section text-base; groups and cards are text-sm font-semibold (GroupTitle, CardTitle). Body is text-sm. ${SECTION}`,
      weight: `"{{className}}" is off the weight scale, and dark mode only steps down font-normal, font-medium, and font-semibold. Use one of those. ${SECTION}`,
      tracking: `"{{className}}" changes letter spacing outside a text-xl title. Remove it. ${SECTION}`,
      leading: `"{{className}}" repeats the default line height of {{size}}. Remove it, or use the {{size}}/relaxed shorthand for long-form text. ${SECTION}`,
    },
    schema: [],
  },
  create(context) {
    return classListVisitors(({ tokens, node }) => {
      const bases = new Set(tokens.map(({ base }) => base));
      // Titles are semibold; a field's text-base with md:text-sm stops mobile zoom.
      const title = bases.has("font-semibold");
      const field = tokens.some(({ token }) => token === "md:text-sm");
      for (const { token, base } of tokens) {
        const report = (messageId: string, data: Record<string, string> = {}) =>
          context.report({ node, messageId, data: { className: token, ...data } });
        if (LARGE_SIZE.test(base) && !title && !field) report("size");
        else if (OFF_WEIGHT.test(base)) report("weight");
        else if (base.startsWith("tracking-") && !bases.has("text-xl")) report("tracking");
        else {
          const size = Object.keys(DEFAULT_LEADING).find(
            (key) => DEFAULT_LEADING[key] === base && bases.has(key),
          );
          if (size) report("leading", { size });
        }
      }
    });
  },
};
