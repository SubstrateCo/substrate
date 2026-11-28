import { mailHref } from "./body-text";
import {
  copyPresentation,
  inlineRaster,
  newsletterRules,
  pictureSources,
} from "./newsletter-style";

const tags = new Set(
  "a p div span section article header footer main blockquote h1 h2 h3 h4 h5 h6 strong b i em u s strike del sup sub small big center font pre code ul ol li dl dt dd hr br wbr img table thead tbody tfoot tr td th caption colgroup col address".split(
    " ",
  ),
);
const drop = new Set(
  "script style head link base meta iframe frame frameset object embed svg math template noscript input button textarea select audio video source canvas".split(
    " ",
  ),
);
const attributes =
  "class id align valign bgcolor border cellpadding cellspacing colspan rowspan width height face color size dir lang role title".split(
    " ",
  );
const blank = /^(?:[\s\u00ad\u200b-\u200f\u2060\ufeff]|\u034f)*$/u;
function decorativePixel(el: HTMLElement) {
  const w = parseFloat(el.getAttribute("width") ?? el.style.width),
    h = parseFloat(el.getAttribute("height") ?? el.style.height);
  return (w <= 2 || h <= 2) && !el.getAttribute("alt")?.trim();
}

export function newsletterLayout(html: string) {
  // The template owner document has no browsing context. Parsing never initiates an image,
  // stylesheet or frame request. Only freshly constructed, allowlisted nodes enter the reader.
  const inert = document.createElement("template").content.ownerDocument;
  const source = inert.createElement("html");
  source.innerHTML = html;
  const body = source.querySelector("body") ?? source;
  const root = inert.createElement("main");
  root.dataset.mailRoot = "";
  const pictures = pictureSources();
  const css = Array.from(source.querySelectorAll("style"), (s) =>
    newsletterRules(s.textContent, pictures),
  ).join("\n");
  function presentation(from: HTMLElement, to: HTMLElement) {
    for (const key of attributes)
      if (from.hasAttribute(key)) to.setAttribute(key, from.getAttribute(key)!);
    if (from.hidden || from.getAttribute("aria-hidden") === "true") to.hidden = true;
    let art = copyPresentation(from.style, to.style, pictures);
    const background = from.getAttribute("background");
    if (background && art === undefined) {
      art = pictures.index(background);
      if (art !== undefined) to.style.backgroundImage = `var(--mail-picture-${art}, none)`;
    }
    if (art !== undefined) to.dataset.mailPoster = String(art);
  }
  function append(parent: HTMLElement, n: Node, depth: number) {
    if (n.nodeType === Node.TEXT_NODE) {
      parent.append(n.textContent ?? "");
      return;
    }
    if (!(n instanceof HTMLElement) || n.namespaceURI !== "http://www.w3.org/1999/xhtml") return;
    const tag = n.localName;
    if (drop.has(tag) || depth > 100) return;
    if (!tags.has(tag)) {
      for (const child of n.childNodes) append(parent, child, depth + 1);
      return;
    }
    if (tag === "img" && decorativePixel(n)) return;
    const el = inert.createElement(tag);
    presentation(n, el);
    if (tag === "a") {
      const href = mailHref(n.getAttribute("href"));
      if (href) {
        el.setAttribute("href", href);
        el.setAttribute("rel", "noopener noreferrer");
        el.setAttribute("target", "_blank");
      }
    }
    if (tag === "img") {
      const src = n.getAttribute("src") ?? "",
        alt = n.getAttribute("alt")?.trim() ?? "";
      el.setAttribute("alt", alt);
      if (inlineRaster(src)) el.setAttribute("src", src);
      else {
        const i = pictures.index(src);
        if (i === undefined) {
          if (alt) parent.append(alt);
          return;
        }
        el.dataset.mailImage = String(i);
        if (alt) {
          const fallback = inert.createElement("span");
          fallback.dataset.mailAlt = String(i);
          fallback.textContent = alt;
          parent.append(fallback);
        }
      }
    }
    for (const child of n.childNodes) append(el, child, depth + 1);
    parent.append(el);
  }
  presentation(body, root);
  for (const child of body.childNodes) append(root, child, 0);
  for (const el of root.querySelectorAll<HTMLElement>("td,tr,table,div,p,a")) {
    if (
      blank.test(el.textContent) &&
      !el.matches("[data-mail-poster]") &&
      !el.querySelector("img,[data-mail-poster]")
    )
      el.dataset.mailSpacer = "";
  }
  for (const el of root.querySelectorAll<HTMLElement>("[data-mail-poster]")) {
    const table = el.closest("table");
    if (table) table.dataset.mailCard = el.dataset.mailPoster;
  }
  return { root, css, sources: pictures.sources };
}
