import type { AstNode, Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

type Finding = { messageId: string; className: string };

function utility(token: string) {
  const base = token.slice(token.lastIndexOf(":") + 1).replace(/^!|!$/g, "");
  return base.startsWith("-") ? base.slice(1) : base;
}

function check(token: string): string | undefined {
  const base = utility(token);
  if (/^font-(?:bold|extrabold|black)$/.test(base)) return "heavy";
  if (base === "font-semibold") return "semibold";
  if (/^tracking-(?:tighter|tight|wide|wider|widest)$/.test(base)) return "tracking";
  if (/^bg-(?:linear|radial|conic|gradient)(?:-|$)/.test(base) || base === "bg-clip-text")
    return "gradient";
  if (base.startsWith("drop-shadow")) return "glow";
  if (
    /^shadow-/.test(base) &&
    !/^shadow-(?:xs|sm|md|lg|xl|2xl|none|surface|raised|floating)$/.test(base)
  )
    return "glow";
  if (base === "transition-all") return "transitionAll";
  if (base === "animate-bounce" || base === "animate-ping") return "loop";
  if (/(?:^|:)hover:/.test(token) && /^scale-(?:\d{3,})$/.test(base) && Number(base.slice(6)) > 100)
    return "hoverScale";
  return undefined;
}

const SURFACE_STOP =
  /^(?:from|via|to)-(?:transparent|background|card|popover|surface|inset|muted|sidebar)(?:\/\d+)?$/;

function findings(value: string): Finding[] {
  const tokens = value.split(/\s+/).filter(Boolean);
  const classList = tokens.some((token) =>
    /^[a-z!@[-][\w:/.[\]()%&>*=!-]*-[\w/.[\]()%-]+$/.test(token),
  );
  const surfaceFade = tokens
    .filter((token) => /^(?:from|via|to)-/.test(utility(token)))
    .every((token) => SURFACE_STOP.test(utility(token)));
  const found: Finding[] = [];
  for (const token of tokens) {
    if (token === "uppercase" || token.endsWith(":uppercase")) {
      if (classList) found.push({ messageId: "uppercase", className: token });
      continue;
    }
    const messageId = check(token);
    if (messageId === "gradient" && surfaceFade && utility(token) !== "bg-clip-text") continue;
    if (messageId) found.push({ messageId, className: token });
  }
  return found;
}

export const noDecorativeClass: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep weight, tracking, colour effects, and motion inside the design contract: no heavy type, tracked or uppercase labels, gradients, glows, or looping and bouncy motion.",
    },
    messages: {
      heavy: `"{{className}}" is heavier than the type scale allows. Use font-medium for titles and emphasis; hierarchy comes from size and colour. ${see("1 Type and radius")}`,
      semibold: `"{{className}}" is reserved for unread items, message authors, and initials. Use font-medium for titles and emphasis. For one of those cases, explain it in // oxlint-disable-next-line design/no-decorative-class -- <case>. ${see("1 Type and radius")}`,
      tracking: `"{{className}}" changes letter spacing. Interface text keeps the font's own tracking; small text never gets negative tracking. ${see("1 Type and radius")}`,
      uppercase: `"{{className}}" sets an uppercase label. Use sentence case with the group label role (text-xs font-medium text-muted-foreground). ${see("1 Type and radius")}`,
      gradient: `"{{className}}" paints a hue gradient or gradient text. Surfaces are one flat token (bg-card, bg-surface, bg-inset), and text is a solid colour. A fade from one surface token to transparent is fine. ${see("1 Type and radius")}`,
      glow: `"{{className}}" adds a glow or coloured shadow. Depth comes from the elevation tokens (shadow-surface, shadow-raised, shadow-floating) and borders. ${see("1 Type and radius")}`,
      transitionAll: `"{{className}}" animates every property, including layout. Name the properties: transition-colors, transition-opacity, transition-transform, or transition-[transform,opacity].`,
      loop: `"{{className}}" loops for attention. Show live work with the Tag tone "working" from "@/components/feedback/tag"; everything else is static.`,
      hoverScale: `"{{className}}" grows the element on hover. Hover is a colour or surface step (hover:bg-row-hover); a press may scale down slightly (active:scale-97).`,
    },
    schema: [],
  },
  create(context) {
    const report = (node: AstNode, value: string) => {
      for (const finding of findings(value))
        context.report({
          node,
          messageId: finding.messageId,
          data: { className: finding.className },
        });
    };
    return {
      Literal(node) {
        // oxlint-disable-next-line deslop/no-runtime-typeof -- ESTree Literal values include strings, numbers, booleans, and null.
        if (typeof node.value === "string") report(node, node.value);
      },
      TemplateElement(node) {
        report(node, node.value.cooked ?? "");
      },
    };
  },
};
