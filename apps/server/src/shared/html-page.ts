import type { Context } from "hono";
import { html, raw } from "hono/html";
import { createHash } from "node:crypto";

const css = `
:root {
  color-scheme: light dark;
  --background: oklch(0.975 0.002 255);
  --foreground: oklch(0.25 0.004 255);
  --card: oklch(1 0 0);
  --primary: oklch(0.48 0.14 255);
  --primary-foreground: oklch(0.985 0 0);
  --muted-foreground: oklch(0.49 0.008 255);
  --border: oklch(0.9 0.004 255);
  --control-border: oklch(0.82 0.005 255);
  --ring: oklch(0.6 0.12 255);
  --row-hover: oklch(0.25 0.01 255 / 5%);
  --elevation-raised: 0 1px 3px oklch(0.2 0.01 255 / 6%), 0 4px 12px -4px oklch(0.2 0.01 255 / 8%);
  --radius: 0.5rem;
  --weight-medium: 500;
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: oklch(0.18 0.004 255);
    --foreground: oklch(0.91 0.003 255);
    --card: oklch(0.235 0.005 255);
    --primary: oklch(0.74 0.11 255);
    --primary-foreground: oklch(0.2 0.03 255);
    --muted-foreground: oklch(0.7 0.007 255);
    --border: oklch(1 0 0 / 9%);
    --control-border: oklch(0.4 0.005 255);
    --ring: oklch(0.7 0.1 255);
    --row-hover: oklch(1 0 0 / 5%);
    --elevation-raised: none;
    --weight-medium: 430;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: var(--background);
  color: var(--foreground);
  font: 400 0.875rem/1.5 "Geist Variable", "Geist", ui-sans-serif, system-ui, -apple-system,
    "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
main {
  width: 100%;
  max-width: 24rem;
  padding: 2rem;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 1.4);
  box-shadow: var(--elevation-raised);
}
h1 { margin: 0 0 0.5rem; font-size: 1.125rem; line-height: 1.4; font-weight: var(--weight-medium); }
p { margin: 0; color: var(--muted-foreground); }
p + p { margin-top: 0.5rem; }
nav { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1.5rem; }
a {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 2.25rem;
  padding: 0 1rem;
  border: 1px solid var(--control-border);
  border-radius: var(--radius);
  color: var(--foreground);
  font-weight: var(--weight-medium);
  text-decoration: none;
}
a:hover { background: var(--row-hover); }
a:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
a.primary { border-color: transparent; background: var(--primary); color: var(--primary-foreground); }
a.primary:hover { background: color-mix(in oklch, var(--primary) 90%, var(--foreground)); }
`;

const styleElement = raw(`<style>${css}</style>`);

export const htmlPageCSP = `default-src 'none'; style-src 'sha256-${createHash("sha256")
  .update(css)
  .digest("base64")}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

export function setHtmlPageHeaders(c: Context) {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Content-Security-Policy", htmlPageCSP);
  c.header("X-Content-Type-Options", "nosniff");
}

export interface HtmlPageAction {
  label: string;
  href: string;
  primary?: boolean;
}

const actionLink = ({ label, href, primary }: HtmlPageAction) => {
  const className = primary ? "primary" : "secondary";
  return html`<a class="${className}" href="${href}" rel="noreferrer">${label}</a>`;
};

export function htmlPage(page: { title: string; paragraphs: string[]; actions: HtmlPageAction[] }) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>${page.title}</title>
        ${styleElement}
      </head>
      <body>
        <main>
          <h1>${page.title}</h1>
          ${page.paragraphs.map((text) => html`<p>${text}</p>`)}
          <nav>${page.actions.map((action) => actionLink(action))}</nav>
        </main>
      </body>
    </html>`;
}
