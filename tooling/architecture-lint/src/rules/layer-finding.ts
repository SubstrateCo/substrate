import type { LayerRule } from "../layers/config.ts";

const stripPeriod = (text: string) => text.trim().replace(/\.$/, "");

/** `[R1] route imports database (@substrate/database). Call a service method.` */
export function layerFinding(rule: LayerRule, target: string, match: string) {
  const message = stripPeriod(rule.message)
    .replaceAll("{target}", target)
    .replaceAll("{match}", match);
  return `[${rule.id}] ${message}. ${stripPeriod(rule.fix)}.`;
}
