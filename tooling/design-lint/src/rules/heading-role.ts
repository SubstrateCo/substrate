import { attribute, classTokens, elementName, possibleStrings, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

const HEADINGS = new Set(["h1", "h2", "h3", "h4"]);
const SIZE = /^text-(xs|sm|base|lg|xl|[2-9]xl)(?:\/.+)?$/;
const WEIGHT = /^font-(normal|medium|semibold|bold)$/;
/** The weight each heading size takes in the role table. */
const ROLE_WEIGHT: Record<string, string> = {
  xs: "medium",
  sm: "semibold",
  base: "semibold",
  lg: "semibold",
  xl: "semibold",
};

export const headingRole: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Give each heading the size and weight of one type role." },
    messages: {
      mismatch: `<{{tag}}> with "{{size}} {{weight}}" matches no heading role, so it reads at the level of the text around it. A group or card title is text-sm font-semibold (GroupTitle from "@/components/layout/settings-section", CardTitle); a group label is text-xs font-medium text-muted-foreground (RecordSection from "@/components/layout/record-section"). ${see("1 Type and radius")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const tag = elementName(node.name);
        if (!HEADINGS.has(tag)) return;
        const tokens = possibleStrings(attribute(node, "className")?.value).flatMap((site) =>
          classTokens(site.value),
        );
        const sizes = tokens.filter(({ base }) => SIZE.test(base));
        const weights = tokens.filter(({ base }) => WEIGHT.test(base));
        for (const size of sizes) {
          const step = SIZE.exec(size.base)![1]!;
          for (const weight of weights) {
            if (WEIGHT.exec(weight.base)![1] === ROLE_WEIGHT[step]) continue;
            context.report({
              node,
              messageId: "mismatch",
              data: { tag, size: size.token, weight: weight.token },
            });
          }
        }
      },
    };
  },
};
