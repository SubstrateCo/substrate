import { classStringVisitors, classTokens, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

// Bare `rounded` (a fixed 0.25rem off the --radius scale) and the sizes above `rounded-xl`, on
// every side or corner: `rounded`, `rounded-t`, `rounded-2xl`, `rounded-tl-3xl`.
const OFF_SCALE = /^rounded(?:-(?:[trblse]|tl|tr|bl|br|ss|se|es|ee))?(?:-(?:2xl|3xl|4xl))?$/;

export const radiusScale: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Use the radius for the element's nesting level." },
    messages: {
      offScale: `"{{className}}" is off the radius scale. Use rounded-xl for a top-level container on a page, rounded-lg for a block inside one (and icon tiles of size-8 and larger), rounded-md for rows, chips, and small tiles, and rounded-full only for people, count badges, and dots. ${see("1 Type and radius")}`,
    },
    schema: [],
  },
  create(context) {
    return classStringVisitors(({ value, node }) => {
      for (const { token, base } of classTokens(value)) {
        if (OFF_SCALE.test(base))
          context.report({ node, messageId: "offScale", data: { className: token } });
      }
    });
  },
};
