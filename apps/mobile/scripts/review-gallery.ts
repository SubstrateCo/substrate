import { themes } from "@substrate/design-tokens";

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function escape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

async function files(directory: string, extension: string) {
  try {
    return (await readdir(directory)).filter((name) => name.endsWith(extension)).sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function writeReviewGallery() {
  const directory = resolve(import.meta.dirname, "../test-results/mobile-review");
  const screenshots = await files(resolve(directory, "screenshots"), ".png");
  const clips = await files(resolve(directory, "clips"), ".mp4");
  const palette = themes.light;
  const colors = Object.entries(palette)
    .map(([name, value]) => `--${name}:${value}`)
    .join(";");
  const stills = screenshots
    .map((name) => {
      const path = `screenshots/${encodeURIComponent(name)}`;
      return `<figure><a href="${path}"><img loading="lazy" src="${path}" alt="${escape(name)}"></a><figcaption>${escape(name)}</figcaption></figure>`;
    })
    .join("\n");
  const motion = clips
    .map(
      (name) =>
        `<figure><video controls muted loop playsinline preload="metadata" src="clips/${encodeURIComponent(name)}"></video><figcaption>${escape(name)}</figcaption></figure>`,
    )
    .join("\n");
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "index.html"),
    `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Substrate mobile review — Expo web preview</title>
<style>
:root{${colors}}*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--background);color:var(--foreground);font:15px/1.5 system-ui,sans-serif}header{max-width:900px;margin-bottom:32px}h1{margin:0 0 8px;font-size:28px}h2{margin-top:32px}p{margin:0;color:var(--muted-foreground)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px}figure{margin:0;min-width:0}img,video{display:block;width:100%;max-width:390px;height:auto;border:1px solid var(--border);border-radius:8px}figcaption{margin-top:8px;font-size:12px;overflow-wrap:anywhere;color:var(--muted-foreground)}a{color:inherit}
</style>
<header><h1>Substrate mobile review</h1><p>Real Expo web preview captures against the test backend. These are not native iOS or Android validation. Click a screenshot to inspect it at full size.</p></header>
<h2>Screenshots (${screenshots.length})</h2><section class="grid">${stills}</section>
<h2>Motion (${clips.length})</h2><section class="grid">${motion}</section></html>`,
  );
}
