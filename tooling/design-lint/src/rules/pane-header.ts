import { classListVisitors, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

export const paneHeader: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: 'Use PageHeader variant="pane" instead of a hand-built 48px header.' },
    messages: {
      handBuilt: `This is a hand-built pane header (h-12 with a bottom border). Use <PageHeader variant="pane"> from "@/components/layout/page-header", or PageSidebarHeader at the top of a PageSidebar, so every pane title has the same height, inset, type, and tool spacing. ${see("3 Pages and settings")}`,
    },
    schema: [],
  },
  create(context) {
    return classListVisitors(({ tokens, node }) => {
      const bases = new Set(tokens.map(({ base }) => base));
      // A row of a grid (a calendar hour) is h-12 with a border too, but it has no inset or line.
      if (
        bases.has("h-12") &&
        bases.has("border-b") &&
        (bases.has("px-4") || bases.has("items-center"))
      )
        context.report({ node, messageId: "handBuilt" });
    });
  },
};
