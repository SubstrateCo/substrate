import { classStringVisitors, classTokens, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

// Properties that animate without moving layout: transform, opacity, and hover or focus colour.
const PAINT_PROPERTIES = new Set([
  "transform",
  "translate",
  "scale",
  "rotate",
  "opacity",
  "color",
  "background-color",
  "border-color",
  "outline-color",
  "text-decoration-color",
  "fill",
  "stroke",
  "box-shadow",
]);
const ARBITRARY_TRANSITION = /^transition-\[(.+)\]$/;

/** Whether a transition class animates layout: `transition-all`, `transition-[width]`. */
function animatesLayout(base: string) {
  if (base === "transition-all") return true;
  const properties = ARBITRARY_TRANSITION.exec(base)?.[1];
  return properties !== undefined && properties.split(",").some((p) => !PAINT_PROPERTIES.has(p));
}

export const motion: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Use the motion tokens: no endless attention motion, no ease-in, and no layout transitions.",
    },
    messages: {
      attention: `"{{className}}" never stops moving, so it pulls attention from the work on every screen it appears. Working is a soft motion-safe:animate-pulse dot and "needs you" is a steady dot: use <WorkIndicator tone="working" | "attention"> from "@/components/agent-work/work-indicator". ${see("6 Motion")}`,
      easeIn: `"{{className}}" starts slowly, so the UI feels late at the moment of input. Use ease-out (the strong curve from components/styles.css) for UI, or ease-drawer for drawers. ${see("6 Motion")}`,
      layout: `"{{className}}" animates layout, which reflows the page on every frame. Animate transform and opacity (transition, transition-transform, transition-opacity), or colour for hover and focus (transition-colors). For a disclosure that opens to its height, use Collapsible from "@/components/ui/collapsible". ${see("6 Motion")}`,
    },
    schema: [],
  },
  create(context) {
    return classStringVisitors(({ value, node }) => {
      for (const { token, base } of classTokens(value)) {
        if (base === "animate-ping" || base === "animate-bounce")
          context.report({ node, messageId: "attention", data: { className: token } });
        else if (base === "ease-in")
          context.report({ node, messageId: "easeIn", data: { className: token } });
        else if (animatesLayout(base))
          context.report({ node, messageId: "layout", data: { className: token } });
      }
    });
  },
};
