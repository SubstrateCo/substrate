import type { AstNode, Rule } from "../ast.ts";
import type { ArchitectureConfig } from "../layers/config.ts";
import type { ImportTarget, LayerModel } from "../layers/model.ts";
import { layerFinding } from "./layer-finding.ts";

function importTest(entry: string) {
  const end = entry.lastIndexOf("/");
  if (entry.startsWith("/") && end > 0) {
    const pattern = new RegExp(entry.slice(1, end), entry.slice(end + 1));
    return ({ target, specifier }: ImportTarget) => pattern.test(target) || pattern.test(specifier);
  }
  return ({ target }: ImportTarget) => target === entry;
}

function typeOnly(node: AstNode) {
  if (node.type === "ImportDeclaration") {
    if (node.importKind === "type") return true;
    return (
      node.specifiers.length > 0 &&
      node.specifiers.every(
        (specifier) => specifier.type === "ImportSpecifier" && specifier.importKind === "type",
      )
    );
  }
  if (node.type === "ExportNamedDeclaration") {
    if (node.exportKind === "type") return true;
    return (
      node.specifiers.length > 0 &&
      node.specifiers.every((specifier) => specifier.exportKind === "type")
    );
  }
  return node.type === "ExportAllDeclaration" && node.exportKind === "type";
}

export function layerImports(config: ArchitectureConfig, model: LayerModel): Rule {
  const rules = config.rules
    .filter((rule) => rule.forbidImports?.length)
    .map((rule) => ({
      ...rule,
      layers: [rule.layer].flat(),
      tests: (rule.forbidImports ?? []).map(importTest),
    }));
  const layers = new Map(config.layers.map((layer) => [layer.name, layer]));

  return {
    meta: {
      type: "problem",
      docs: { description: "Enforce the layer import rules in architecture.config.json." },
      schema: [],
    },
    create(context) {
      const located = model.fileLayer(context.filename);
      if (!located) return {};
      const { file, layer } = located;
      const mayImport = layers.get(layer)?.mayImport;

      function check(node: AstNode, specifier: string) {
        const imported = model.classify(file, specifier);
        const otherLayer = model.layerNames.has(imported.target) && imported.target !== layer;
        const disallowed = mayImport && otherLayer && !mayImport.includes(imported.target);
        if (disallowed && !model.excepted("X3", file)) {
          context.report({
            node,
            message: `[X3] ${layer} imports ${imported.target} (${specifier}); it may import only ${mayImport.join(", ") || "no other layer"}. Invert the dependency, or move the shared code to a layer both may import.`,
          });
        }
        const isType = typeOnly(node);
        for (const rule of rules) {
          if (!rule.layers.includes(layer) || (isType && rule.allowTypeOnly)) continue;
          if (!rule.tests.some((test) => test(imported)) || model.excepted(rule.id, file)) continue;
          context.report({
            node,
            message: layerFinding(rule, imported.target, specifier),
          });
        }
      }

      return {
        ImportDeclaration: (node) => check(node, node.source.value),
        ExportNamedDeclaration: (node) => {
          if (node.source) check(node, node.source.value);
        },
        ExportAllDeclaration: (node) => check(node, node.source.value),
        ImportExpression: (node) => {
          // oxlint-disable-next-line deslop/no-runtime-typeof -- ESTree Literal values include strings, numbers, booleans, and null.
          if (node.source.type === "Literal" && typeof node.source.value === "string")
            check(node, node.source.value);
        },
      };
    },
  };
}
