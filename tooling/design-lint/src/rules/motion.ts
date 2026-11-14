import { classStringVisitors, classTokens, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

export const motion: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Use the motion tokens: no endless attention motion and no ease-in." },
    messages: {
      attention: `"{{className}}" never stops moving, so it pulls attention from the work on every screen it appears. Working is a soft motion-safe:animate-pulse dot and "needs you" is a steady dot: use <WorkIndicator tone="working" | "attention"> from "@/components/agent-work/work-indicator". ${see("6 Motion")}`,
      easeIn: `"{{className}}" starts slowly, so the UI feels late at the moment of input. Use ease-out (the strong curve from components/styles.css) for UI, or ease-drawer for drawers. ${see("6 Motion")}`,
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
      }
    });
  },
};
