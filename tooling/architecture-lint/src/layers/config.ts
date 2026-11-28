export interface ArchitectureConfig {
  root?: string;
  include?: string[];
  ignore?: string[];
  layers: Layer[];
  rules: LayerRule[];
  exceptions?: RuleException[];
}

interface Layer {
  name: string;
  files: string[];
  specifiers?: string[];
  mayImport?: string[];
}

export interface LayerRule {
  id: string;
  tag: string;
  layer: string | string[];
  forbidImports?: string[];
  allowTypeOnly?: boolean;
  forbidCalls?: string[];
  forbidNew?: string[];
  forbidMembers?: string[];
  forbidSyntax?: string[];
  message: string;
  fix: string;
}

interface RuleException {
  rule: string;
  files: string[];
  reason?: string;
}

const BUILT_IN_RULES = ["X3"];
const TARGET_LABELS = new Set(["unlayered", "builtin", "unresolved"]);
const CHECKS = ["forbidImports", "forbidCalls", "forbidNew", "forbidMembers", "forbidSyntax"];
const FIELDS = {
  layer: ["name", "files", "specifiers", "mayImport"],
  rule: ["id", "tag", "layer", "allowTypeOnly", "message", "fix", ...CHECKS],
  exception: ["rule", "files", "reason"],
};

export function configProblems(config: ArchitectureConfig): string[] {
  const problems: string[] = [];
  const unknownFields = (keys: string[], known: string[], where: string) => {
    for (const key of keys) {
      if (!known.includes(key)) problems.push(`${where}: unknown field "${key}"`);
    }
  };
  if (!Array.isArray(config.layers) || !Array.isArray(config.rules))
    return ['"layers" and "rules" must be arrays'];

  const layerNames = new Set(config.layers.map((layer) => layer.name));
  config.layers.forEach((layer, index) => {
    const where = `layers[${index}] (${layer.name})`;
    unknownFields(Object.keys(layer), FIELDS.layer, where);
    for (const name of layer.mayImport ?? []) {
      if (!layerNames.has(name)) problems.push(`${where}: mayImport names unknown layer "${name}"`);
    }
  });
  config.rules.forEach((rule, index) => {
    const where = `rules[${index}] (${rule.id})`;
    unknownFields(Object.keys(rule), FIELDS.rule, where);
    if (BUILT_IN_RULES.includes(rule.id))
      problems.push(`${where}: "${rule.id}" is a built-in rule ID`);
    for (const name of [rule.layer].flat()) {
      if (!layerNames.has(name)) problems.push(`${where}: unknown layer "${name}"`);
    }
    const checks = [
      rule.forbidImports,
      rule.forbidCalls,
      rule.forbidNew,
      rule.forbidMembers,
      rule.forbidSyntax,
    ];
    if (!checks.some((check) => check?.length))
      problems.push(`${where}: needs one of ${CHECKS.join(", ")}`);
    for (const entry of rule.forbidImports ?? []) {
      const label = /^(3p|pkg):/.test(entry) || TARGET_LABELS.has(entry);
      if (!entry.startsWith("/") && !label && !layerNames.has(entry))
        problems.push(
          `${where}: forbidImports entry "${entry}" is not a layer, a target label, or a /regex/`,
        );
    }
  });
  const ruleIds = new Set([...config.rules.map((rule) => rule.id), ...BUILT_IN_RULES]);
  (config.exceptions ?? []).forEach((exception, index) => {
    const where = `exceptions[${index}]`;
    unknownFields(Object.keys(exception), FIELDS.exception, where);
    if (!ruleIds.has(exception.rule)) problems.push(`${where}: unknown rule "${exception.rule}"`);
    if (!exception.reason?.trim()) problems.push(`${where}: needs a reason`);
  });
  return problems;
}
