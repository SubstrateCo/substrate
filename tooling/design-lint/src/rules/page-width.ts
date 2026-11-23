import { classStringVisitors, classTokens, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

// Column widths. Smaller caps (max-w-sm, max-w-md, max-w-lg) set a text measure, not a page column.
const COLUMN_WIDTH = /^max-w-(?:xl|2xl|3xl|5xl|6xl|7xl|screen-\w+)$/;

export const pageWidth: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Use the two page widths: reading max-w-4xl, or full." },
    messages: {
      width: `"{{className}}" adds a third page width, so columns jump in width between screens. Use max-w-4xl for reading pages (settings, feeds, records, agent panels) or no cap for tables, boards, and dashboards. For dialogs use DialogContent size. ${see("3 Pages and settings")}`,
    },
    schema: [],
  },
  create(context) {
    return classStringVisitors(({ value, node }) => {
      for (const { token, base } of classTokens(value)) {
        if (COLUMN_WIDTH.test(base))
          context.report({ node, messageId: "width", data: { className: token } });
      }
    });
  },
};
