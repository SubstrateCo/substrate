import { mailHref } from "./body-text";

const layoutProperty =
  /^(?:color|background-(?:color|image|size|position(?:-[xy])?|repeat|origin|clip)|display|visibility|opacity|float|clear|box-sizing|(?:min-|max-)?(?:width|height)|margin(?:-.+)?|padding(?:-.+)?|border(?:-(?:top|right|bottom|left|width|color|style|radius|collapse|spacing)(?:-.+)?)?|font(?:-(?:size|family|weight|style|variant))?|line-height|letter-spacing|word-spacing|white-space|word-break|overflow(?:-[xy]|-wrap)?|text-(?:align|decoration(?:-.+)?|transform|indent|shadow)|vertical-align|table-layout|list-style-type|direction|align-items|justify-content|flex(?:-direction|-wrap|-basis|-grow|-shrink)?|gap)$/;
const resourceFunction = /(?:url|(?:-webkit-)?image-set|image|cross-fade|paint|var|attr)\s*\(/i;

export function inlineRaster(value: string) {
  return (
    value.length <= 6_000_000 &&
    /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z\d+/=\s]+$/i.test(value)
  );
}
export function pictureSources() {
  const sources: string[] = [];
  const indexes = new Map<string, number>();
  function index(raw: string) {
    const href = mailHref(raw.startsWith("//") ? `https:${raw}` : raw);
    if (!href || href.length > 8192) return undefined;
    const known = indexes.get(href);
    if (known !== undefined) return known;
    if (sources.length >= 80) return undefined;
    const i = sources.length;
    sources.push(href);
    indexes.set(href, i);
    return i;
  }
  return { sources, index };
}
type Sources = ReturnType<typeof pictureSources>;

export function copyPresentation(
  input: CSSStyleDeclaration,
  output: CSSStyleDeclaration,
  pictures: Sources,
) {
  let art: number | undefined;
  for (const property of Array.from(input)) {
    if (!layoutProperty.test(property)) continue;
    let value = input.getPropertyValue(property);
    if (property === "background-image") {
      const url = /^url\(\s*["']?([^"')]+)["']?\s*\)$/i.exec(value)?.[1];
      if (url && !inlineRaster(url)) {
        art = pictures.index(url);
        if (art === undefined) continue;
        value = `var(--mail-picture-${art}, none)`;
      } else if (!url && resourceFunction.test(value)) continue;
    } else if (resourceFunction.test(value)) continue;
    output.setProperty(
      property,
      value,
      property === "height" || property === "min-height" ? "" : input.getPropertyPriority(property),
    );
  }
  return art;
}

export function newsletterRules(css: string, pictures: Sources) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const declaration = document.createElement("span").style;
  function rules(list: CSSRuleList): string {
    return Array.from(list, (rule) => {
      if (rule instanceof CSSMediaRule)
        return `@media ${rule.conditionText}{${rules(rule.cssRules)}}`;
      if (!(rule instanceof CSSStyleRule)) return "";
      declaration.cssText = "";
      copyPresentation(rule.style, declaration, pictures);
      return declaration.length ? `${rule.selectorText}{${declaration.cssText}}` : "";
    }).join("\n");
  }
  return rules(sheet.cssRules);
}

export const readerBase = `
  html,body{margin:0; padding:0; height:auto!important; min-height:0!important; color-scheme:light}
  body{font:14px/1.5 system-ui,sans-serif;color:#25262b;background:white;overflow-wrap:break-word}
  main[data-mail-root]{display:flow-root;min-width:0}
  table,img{max-width:100%!important} table{min-width:0!important} img{height:auto}
  a{color:#383bad} pre{white-space:pre-wrap} p{margin:.5em 0 1em}
`;
export const readerFit = `
  html,body{height:auto!important;min-height:0!important}
  [data-mail-alt]{font:12px/1.4 system-ui,sans-serif}
  img[data-mail-image]:not([src]){display:none!important}
  main[data-mail-root]{height:auto!important;min-height:0!important}
  html[data-mail-compact] :is(table,tr,td,th,div,a){height:auto!important;min-height:0!important}
  [data-mail-card]:not([data-mail-ready]),[data-mail-card]:not([data-mail-ready]) :is(table,tr,td,a){height:auto!important;min-height:0!important}
  [data-mail-poster]:not([data-mail-ready]){background-color:#e9edf3!important;color:#25314a!important}
  [data-mail-poster]:not([data-mail-ready]) :is(a,span,strong,h1,h2,h3,p,td){color:#25314a!important;background-color:transparent!important}
  [data-mail-poster]:not([data-mail-ready]) td{padding-block:3px!important}
  html[data-mail-compact] [data-mail-spacer]{display:none!important}
  @media(max-width:520px){body,main[data-mail-root],table,td,div{min-width:0!important}img{max-width:100%!important}}
`;
