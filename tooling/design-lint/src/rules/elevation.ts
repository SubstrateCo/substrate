import { classStringVisitors, classTokens, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

const STOCK_SHADOW = /^shadow-(?:2xs|xs|sm|md|lg|xl|2xl|inner|\[.*\])$/;

export const elevation: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Use the three elevation tokens, not stock or arbitrary shadows." },
    messages: {
      stock: `"{{className}}" is a stock shadow, so the surface floats at its own height and ignores the dark-mode shadows. Use shadow-surface (cards that lift a little), shadow-raised (toolbars, drag previews), or shadow-floating (menus, popovers, dialogs), or shadow-none. ${see("1 Primitives")}`,
    },
    schema: [],
  },
  create(context) {
    return classStringVisitors(({ value, node }) => {
      for (const { token, base } of classTokens(value)) {
        if (STOCK_SHADOW.test(base))
          context.report({ node, messageId: "stock", data: { className: token } });
      }
    });
  },
};
