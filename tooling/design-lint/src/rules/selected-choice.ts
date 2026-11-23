import { classStringVisitors, classTokens, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

const CHECKED = "has-[[data-state=checked]]:";
const SELECTED: Record<string, string> = { bg: "bg-row-selected", border: "border-ring" };

export const selectedChoice: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Mark a selected choice card with the selected-row tokens." },
    messages: {
      token: `"{{className}}" marks a selected choice card with its own colour. Use ${CHECKED}border-ring ${CHECKED}bg-row-selected, the same tokens as a selected row. ${see("1 Type and radius")}`,
    },
    schema: [],
  },
  create(context) {
    return classStringVisitors(({ value, node }) => {
      for (const { token, base } of classTokens(value)) {
        if (!token.includes(CHECKED)) continue;
        const utility = /^(bg|border)-/.exec(base)?.[1];
        if (utility && base !== SELECTED[utility])
          context.report({ node, messageId: "token", data: { className: token } });
      }
    });
  },
};
