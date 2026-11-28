import type { AstNode, Rule } from "../ast.ts";

const CITATION = /(?:[\w@./-]+)?:\d+/;

function evidenceByFlag(comment: string) {
  const evidence = new Map<string, string>();
  const bullets = comment
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/, ""))
    .join("\n")
    .split(/\n(?=- )/);
  for (const bullet of bullets) {
    const match = /^- ([\w ,]+):([\s\S]*)$/.exec(bullet.trim());
    if (!match) continue;
    for (const flag of match[1].split(",")) evidence.set(flag.trim(), match[2]);
  }
  return evidence;
}

function typeName(node: AstNode | null | undefined) {
  if (node?.type !== "TSTypeReference") return undefined;
  return node.typeName.type === "Identifier" ? node.typeName.name : undefined;
}

export const capabilityCitations: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Cite file:line evidence for every capability flag that is on." },
    messages: {
      missing:
        "`{{flag}}: true` has no evidence. Add a `- {{flag}}: ...` bullet with a `file:line` citation from the installed SDK or protocol types to the doc comment above, or leave the flag false.",
      uncited:
        "The `{{flag}}` bullet cites no `file:line`. Cite the installed SDK or protocol types that prove it, or leave the flag false.",
    },
    schema: [],
  },
  create(context) {
    return {
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier" || node.init?.type !== "ObjectExpression") return;
        if (typeName(node.id.typeAnnotation?.typeAnnotation) !== "AdapterCapabilities") return;
        const declaration = node.parent;
        const statement =
          declaration.parent?.type === "ExportNamedDeclaration" ? declaration.parent : declaration;
        const docs = context.sourceCode
          .getCommentsBefore(statement)
          .filter((comment) => comment.type === "Block" && comment.value.startsWith("*"))
          .map((comment) => comment.value)
          .join("\n");
        const evidence = evidenceByFlag(docs);
        for (const property of node.init.properties) {
          if (property.type !== "Property" || property.key.type !== "Identifier") continue;
          if (property.value.type !== "Literal" || property.value.value !== true) continue;
          const flag = property.key.name;
          const bullet = evidence.get(flag);
          if (bullet === undefined)
            context.report({ node: property, messageId: "missing", data: { flag } });
          else if (!CITATION.test(bullet))
            context.report({ node: property, messageId: "uncited", data: { flag } });
        }
      },
    };
  },
};
