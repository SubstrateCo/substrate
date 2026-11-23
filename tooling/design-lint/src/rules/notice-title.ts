import { attributeString, elementImport, type Rule } from "../ast.ts";

export const noticeTitle: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Keep notice titles free of trailing periods." },
    messages: {
      period:
        'A notice title has no trailing period. Write "No tasks", not "No tasks."; keep complete sentences in the description.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const title = attributeString(node, "title");
        if (!title?.trimEnd().endsWith(".")) return;
        const imported = elementImport(context, node);
        if (!imported) return;
        const module = imported.source.replace(/\.[jt]sx?$/, "");
        const notice =
          (imported.name === "ContentNotice" && module.endsWith("/feedback/content-notice")) ||
          (imported.name === "ErrorState" && module.endsWith("/feedback/error-state"));
        if (!notice || !/^(?:@\/components\/|\.\.?\/)/.test(module)) return;
        context.report({ node, messageId: "period" });
      },
    };
  },
};
