import { attribute, attributeString, elementImport, type NodeOf, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

/** The heading level when it is a number literal, such as `level={1}`. */
function staticLevel(node: NodeOf<"JSXOpeningElement">) {
  const value = attribute(node, "level")?.value;
  if (value?.type !== "JSXExpressionContainer") return undefined;
  const expression = value.expression;
  // oxlint-disable-next-line deslop/no-runtime-typeof -- ESTree Literal values include strings, numbers, booleans, and null.
  return expression.type === "Literal" && typeof expression.value === "number"
    ? expression.value
    : undefined;
}

export const pageHeader: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Build page and section titles from the shared header components." },
    messages: {
      pageTitle: `A <Heading> page title built by hand lets the title size, inset, and action alignment drift between pages. Use <PageHeader title="." description="." actions={.}> from "@/components/layout/page-header" (variant="pane" for 48px pane headers), SettingsPanel from "@/components/layout/settings-page" for a settings section, or AuthFrame from "@/components/auth/auth-frame" for guest pages. ${see("3 Pages and settings")}`,
      sectionTitle: `<Heading variant="section"> is the settings section title. Use SettingsSection or SettingsCard title="." from "@/components/layout/settings-section"; a record's own name is variant="record". ${see("3 Pages and settings")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const imported = elementImport(context, node);
        if (imported?.name !== "Heading") return;
        const module = imported.source.replace(/\.[jt]sx?$/, "");
        if (!module.endsWith("/ui/heading") || !/^(?:@\/components\/|\.\.?\/)/.test(module)) return;
        const variant = attributeString(node, "variant");
        if (staticLevel(node) === 1 || variant === "page")
          context.report({ node, messageId: "pageTitle" });
        else if (variant === "section") context.report({ node, messageId: "sectionTitle" });
      },
    };
  },
};
