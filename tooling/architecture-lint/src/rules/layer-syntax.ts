import { type AstNode, memberPath, pathPattern, type Rule } from "../ast.ts";
import type { ArchitectureConfig } from "../layers/config.ts";
import type { LayerModel } from "../layers/model.ts";
import { layerFinding } from "./layer-finding.ts";

const compile = (patterns: string[] = []) => patterns.map(pathPattern);

export function layerSyntax(config: ArchitectureConfig, model: LayerModel): Rule {
  const rules = config.rules
    .filter(
      (rule) =>
        rule.forbidCalls?.length ||
        rule.forbidNew?.length ||
        rule.forbidMembers?.length ||
        rule.forbidSyntax?.length,
    )
    .map((rule) => ({
      rule,
      layers: [rule.layer].flat(),
      calls: compile(rule.forbidCalls),
      constructors: compile(rule.forbidNew),
      members: compile(rule.forbidMembers),
      syntax: new Set(rule.forbidSyntax),
    }));
  const syntaxTypes = new Set(rules.flatMap(({ syntax }) => [...syntax]));

  return {
    meta: {
      type: "problem",
      docs: { description: "Enforce the layer code rules in architecture.config.json." },
      schema: [],
    },
    create(context) {
      const located = model.fileLayer(context.filename);
      if (!located) return {};
      const { file, layer } = located;
      const active = rules.filter(
        ({ rule, layers }) => layers.includes(layer) && !model.excepted(rule.id, file),
      );
      if (!active.length) return {};

      function check(
        node: AstNode,
        match: string,
        patterns: (entry: (typeof active)[number]) => RegExp[],
      ) {
        for (const entry of active) {
          if (!patterns(entry).some((pattern) => pattern.test(match))) continue;
          context.report({ node, message: layerFinding(entry.rule, layer, match) });
        }
      }

      function checkSyntax(node: AstNode) {
        for (const entry of active) {
          if (entry.syntax.has(node.type))
            context.report({ node, message: layerFinding(entry.rule, layer, node.type) });
        }
      }

      const syntaxVisitors = Object.fromEntries(
        [...syntaxTypes].map((type) => [type, checkSyntax]),
      );
      return {
        ...syntaxVisitors,
        CallExpression: (node) => {
          check(node, memberPath(node.callee), (entry) => entry.calls);
          checkSyntax(node);
        },
        NewExpression: (node) => {
          check(node, memberPath(node.callee), (entry) => entry.constructors);
          checkSyntax(node);
        },
        MemberExpression: (node) => {
          check(node, memberPath(node), (entry) => entry.members);
          checkSyntax(node);
        },
      };
    },
  };
}
