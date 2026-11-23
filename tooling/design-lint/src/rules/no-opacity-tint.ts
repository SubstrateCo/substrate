import { classStringVisitors, classTokens, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

// A theme colour mixed down with opacity: `bg-muted/40`, `border-warning/50`, `text-foreground/80`.
// `bg-muted-foreground/<n>` dots, `ring-ring/50`, and `bg-(--calendar-color)/15` are not matched.
const TINT =
  /^(?:bg|text|border)-(?:muted|primary|accent|foreground|warning|destructive|success)\/\d+$/;

export const noOpacityTint: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Use a surface, row, or tone token instead of an opacity tint." },
    messages: {
      tint: `"{{className}}" mixes a theme colour with opacity. Use a token: bg-inset for inset surfaces, bg-row-hover and bg-row-selected for rows, text-muted-foreground for quiet text, and toneBorder / toneFill (or Tag tone) from components/feedback/tag.tsx for warning and destructive tints. ${see("1 Type and radius")}`,
    },
    schema: [],
  },
  create(context) {
    return classStringVisitors(({ value, node }) => {
      for (const { token, base } of classTokens(value)) {
        if (TINT.test(base))
          context.report({ node, messageId: "tint", data: { className: token } });
      }
    });
  },
};
