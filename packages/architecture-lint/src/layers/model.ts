import type { ArchitectureConfig } from "./config.ts";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";

function globBody(glob: string): string {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      out += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (ch === "*") out += "[^/]*";
    else if (ch === "?") out += "[^/]";
    else if (ch === "{") {
      const end = glob.indexOf("}", i);
      out += `(?:${glob
        .slice(i + 1, end)
        .split(",")
        .map(globBody)
        .join("|")})`;
      i = end;
    } else out += ch.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return out;
}

/** Matches repository-relative POSIX paths against globs with `**`, `*`, `?`, and `{a,b}`. */
export function globMatcher(globs: string[] = []) {
  const patterns = globs.map((glob) => new RegExp(`^${globBody(glob)}$`));
  return (file: string) => patterns.some((pattern) => pattern.test(file));
}

const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const BUILTINS = new Set(builtinModules);

export interface ImportTarget {
  /** A layer name, `unlayered`, `unresolved`, `builtin`, `pkg:<workspace>`, or `3p:<package>`. */
  target: string;
  specifier: string;
}

export interface Workspace {
  /** Absolute repository root; config globs are relative to it. */
  root: string;
  isFile: (path: string) => boolean;
  workspacePackages: ReadonlySet<string>;
}

/**
 * Puts files into layers and import specifiers into targets, the way the architecture
 * scanner does. The first matching layer wins.
 */
export function layerModel(
  config: ArchitectureConfig,
  { root, isFile, workspacePackages }: Workspace,
) {
  const included = globMatcher(config.include ?? ["**/*"]);
  const ignored = globMatcher(config.ignore ?? []);
  const layers = config.layers.map((layer) => ({
    ...layer,
    matches: globMatcher(layer.files),
    specifierPatterns: (layer.specifiers ?? []).map((pattern) => new RegExp(pattern)),
  }));
  const exceptions = (config.exceptions ?? []).map((exception) => ({
    rule: exception.rule,
    matches: globMatcher(exception.files),
  }));
  const layerOf = (file: string) => layers.find((layer) => layer.matches(file));
  const resolved = new Map<string, string | undefined>();

  function resolveFile(base: string) {
    if (resolved.has(base)) return resolved.get(base);
    const candidates = [
      base,
      ...EXTENSIONS.map((ext) => base + ext),
      ...EXTENSIONS.map((ext) => join(base, `index${ext}`)),
    ];
    if (/\.[mc]?js$/.test(base)) candidates.push(base.replace(/\.[mc]?js$/, ".ts"));
    const hit = candidates.find(isFile);
    resolved.set(base, hit);
    return hit;
  }

  const relativePath = (absolute: string) => relative(root, absolute).split(sep).join("/");

  return {
    layerNames: new Set(layers.map((layer) => layer.name)),

    /** The repository-relative file and its layer, or undefined for files outside the config. */
    fileLayer(filename: string) {
      const file = relativePath(filename);
      if (!included(file) || ignored(file)) return undefined;
      const layer = layerOf(file);
      return layer && { file, layer: layer.name };
    },

    classify(file: string, specifier: string): ImportTarget {
      if (specifier.startsWith(".")) {
        const hit = resolveFile(resolve(root, dirname(file), specifier));
        if (!hit) return { specifier, target: "unresolved" };
        return { specifier, target: layerOf(relativePath(hit))?.name ?? "unlayered" };
      }
      const bySpecifier = layers.find((layer) =>
        layer.specifierPatterns.some((pattern) => pattern.test(specifier)),
      );
      if (bySpecifier) return { specifier, target: bySpecifier.name };
      const [first = "", second = ""] = specifier.split("/");
      const runtimeModule = /^(node|bun):/.test(specifier) || specifier === "bun";
      if (runtimeModule || BUILTINS.has(first)) return { specifier, target: "builtin" };
      const name = specifier.startsWith("@") ? `${first}/${second}` : first;
      return { specifier, target: `${workspacePackages.has(name) ? "pkg" : "3p"}:${name}` };
    },

    excepted: (rule: string, file: string) =>
      exceptions.some((exception) => exception.rule === rule && exception.matches(file)),
  };
}

export type LayerModel = ReturnType<typeof layerModel>;
