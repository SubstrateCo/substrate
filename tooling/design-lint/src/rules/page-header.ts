import {
  attribute,
  classTokens,
  elementName,
  type NodeOf,
  possibleStrings,
  type Rule,
} from "../ast.ts";
import { see } from "../design-doc.ts";

const PAGE_SCALE = new Set(["text-lg", "text-xl", "text-2xl", "text-3xl"]);

/**
 * A heading whose only content is a record's own field, such as `{task.title}` in an inspector,
 * is the record's content, not page or section chrome.
 */
function showsRecordField(opening: NodeOf<"JSXOpeningElement">) {
  const element = opening.parent;
  if (element.type !== "JSXElement") return false;
  const content = element.children.filter(
    (child) => child.type !== "JSXText" || child.value.trim() !== "",
  );
  const [only] = content;
  return (
    content.length === 1 &&
    only.type === "JSXExpressionContainer" &&
    only.expression.type === "MemberExpression"
  );
}

export const pageHeader: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Build page and section titles from the shared header components." },
    messages: {
      pageTitle: `A raw <h1> builds a page title by hand, so the title size, inset, and action alignment drift between pages. Use <PageHeader title="…" description="…" actions={…}> from "@/components/layout/page-header" (variant="pane" for 48px pane headers), SettingsPanel from "@/components/layout/settings-page" for a settings section, or AuthFrame from "@/components/auth/auth-frame" for guest pages. ${see("3 Pages and settings")}`,
      sectionTitle: `<{{tag}} className="{{size}}"> is a page-scale heading built by hand. Page titles use <PageHeader> from "@/components/layout/page-header"; settings groups use SettingsSection or SettingsCard title="…" from "@/components/layout/settings-section"; dialog titles use DialogTitle. ${see("3 Pages and settings")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const tag = elementName(node.name);
        if (tag === "h1") {
          context.report({ node, messageId: "pageTitle" });
          return;
        }
        if (tag !== "h2" && tag !== "h3") return;
        if (showsRecordField(node)) return;
        const size = possibleStrings(attribute(node, "className")?.value)
          .flatMap((site) => classTokens(site.value))
          .find(({ base }) => PAGE_SCALE.has(base.split("/")[0] ?? base));
        if (size)
          context.report({ node, messageId: "sectionTitle", data: { tag, size: size.token } });
      },
    };
  },
};
