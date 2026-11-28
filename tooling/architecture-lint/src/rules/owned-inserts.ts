import { isImportBinding, type Rule } from "../ast.ts";
import { globMatcher } from "../layers/model.ts";
import { relative, sep } from "node:path";

export interface OwnedInsertsOptions {
  tables: Record<string, { files: string[]; use: string }>;
}

export function ownedInserts(root: string): Rule {
  return {
    meta: {
      type: "problem",
      docs: { description: "Insert into owned tables only through their owner." },
      messages: {
        owned:
          "Insert into `{{table}}` only through {{use}}. A direct insert skips the invariants that its owner enforces.",
      },
      schema: [
        {
          type: "object",
          properties: {
            tables: {
              type: "object",
              additionalProperties: {
                type: "object",
                properties: {
                  files: { type: "array", items: { type: "string" } },
                  use: { type: "string" },
                },
                required: ["files", "use"],
                additionalProperties: false,
              },
            },
          },
          required: ["tables"],
          additionalProperties: false,
        },
      ],
    },
    create(context) {
      // SAFETY: oxlint validates the options against the schema above before the rule runs.
      const options = (context.options[0] ?? { tables: {} }) as OwnedInsertsOptions;
      const file = relative(root, context.filename).split(sep).join("/");
      const owned = new Map(
        Object.entries(options.tables)
          .filter(([, owner]) => !globMatcher(owner.files)(file))
          .map(([table, owner]) => [table, owner.use]),
      );
      if (!owned.size) return {};
      return {
        CallExpression(node) {
          const { callee } = node;
          if (callee.type !== "MemberExpression" || callee.computed) return;
          if (callee.property.type !== "Identifier" || callee.property.name !== "insert") return;
          const table = node.arguments.at(0);
          if (table?.type !== "Identifier") return;
          const use = owned.get(table.name);
          if (!use || !isImportBinding(context, table, table.name)) return;
          context.report({ node, messageId: "owned", data: { table: table.name, use } });
        },
      };
    },
  };
}
