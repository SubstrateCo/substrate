import { classStringVisitors, classTokens, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

export const sentenceCase: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Write labels and headings in sentence case." },
    messages: {
      transform: `"{{className}}" changes the case of the text, so labels read as shouting or Title Case ("NOT STARTED", "High Priority") and no longer match the copy. Write the text in sentence case ("Not started", "No priority") and drop the class; small group labels use text-xs font-medium text-muted-foreground. ${see("7 Copy")}`,
    },
    schema: [],
  },
  create(context) {
    return classStringVisitors(({ value, node }) => {
      for (const { token, base } of classTokens(value)) {
        if (base === "uppercase" || base === "capitalize")
          context.report({ node, messageId: "transform", data: { className: token } });
      }
    });
  },
};
