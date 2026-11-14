#!/usr/bin/env bun
// Reference architecture scanner. It lists entrypoints, puts files into layers, and maps imports
// between layers. Lint enforces the rules. Output follows references/scanner.md.
//
// Run:  bun scan.ts [--config architecture.config.json] [--entry <text>] [--json]
// Node: node scan.ts (23.6+), or node --experimental-strip-types scan.ts (22.x)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";

// ---------------------------------------------------------------- config types

interface Layer {
  name: string;
  files: string[];
  specifiers?: string[];
  mayImport?: string[];
}

interface EntrypointGroup {
  name: string;
  files: string[];
  route: string;
  mount?: { files: string[]; pattern: string };
}

interface Config {
  root?: string;
  languages?: string[];
  sourceRoots?: string[];
  include?: string[];
  ignore?: string[];
  layers: Layer[];
  entrypoints: EntrypointGroup[];
}

// ---------------------------------------------------------------- languages
// Add a language by adding an entry here. Each adapter finds imports and
// resolves internal ones to files. Everything else is language-neutral.

interface RawImport {
  index: number;
  specifier: string;
  typeOnly: boolean;
}

interface Language {
  extensions: string[];
  parseImports(text: string): RawImport[];
  resolve(ctx: { root: string; fromFile: string; specifier: string; sourceRoots: string[] }):
    | string
    | undefined;
  isBuiltin(specifier: string): boolean;
  packageName(specifier: string): string;
}

const JS_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const JS_BUILTINS = new Set(builtinModules);
const PY_BUILTINS = new Set(
  "abc argparse asyncio base64 collections contextlib copy csv dataclasses datetime decimal enum functools hashlib hmac http io itertools json logging math os pathlib pickle random re secrets shutil signal socket sqlite3 string subprocess sys tempfile threading time traceback types typing unittest urllib uuid warnings weakref zoneinfo __future__".split(
    " ",
  ),
);

function firstFile(root: string, candidates: string[]) {
  const hit = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  return hit ? toPosix(relative(root, hit)) : undefined;
}

const LANGUAGES = {
  typescript: {
    extensions: JS_EXTENSIONS,
    parseImports(text) {
      const found: RawImport[] = [];
      const fromImport =
        /^[ \t]*(?:import|export)[ \t]+(type[ \t]+)?([\w*{}\s,$]+?)\s*\bfrom[ \t]*["']([^"']+)["']/gm;
      for (const match of text.matchAll(fromImport)) {
        const named = /^\{([^}]*)\}$/.exec(match[2].trim());
        const allTypes =
          named !== null &&
          named[1]
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
            .every((part) => part.startsWith("type "));
        found.push({ index: match.index, specifier: match[3], typeOnly: Boolean(match[1]) || allTypes });
      }
      for (const match of text.matchAll(/^[ \t]*import[ \t]*["']([^"']+)["']/gm)) {
        found.push({ index: match.index, specifier: match[1], typeOnly: false });
      }
      for (const match of text.matchAll(/\b(?:import|require)\(\s*["']([^"']+)["']\s*\)/g)) {
        found.push({ index: match.index, specifier: match[1], typeOnly: false });
      }
      return found;
    },
    resolve({ root, fromFile, specifier }) {
      if (!specifier.startsWith(".") && !specifier.startsWith("/")) return undefined;
      const base = resolve(root, dirname(fromFile), specifier);
      const candidates = [
        base,
        ...JS_EXTENSIONS.map((ext) => base + ext),
        ...JS_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
      ];
      if (/\.[mc]?js$/.test(base)) {
        candidates.push(base.replace(/\.[mc]?js$/, ".ts"), base.replace(/\.[mc]?js$/, ".tsx"));
      }
      return firstFile(root, candidates);
    },
    isBuiltin: (specifier) =>
      specifier.startsWith("node:") ||
      specifier === "bun" ||
      specifier.startsWith("bun:") ||
      JS_BUILTINS.has(specifier.split("/")[0]),
    packageName(specifier) {
      const parts = specifier.split("/");
      return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
    },
  },

  python: {
    extensions: [".py"],
    parseImports(text) {
      const found: RawImport[] = [];
      for (const match of text.matchAll(/^[ \t]*from[ \t]+([.\w]+)[ \t]+import\b/gm)) {
        found.push({ index: match.index, specifier: match[1], typeOnly: false });
      }
      for (const match of text.matchAll(/^[ \t]*import[ \t]+([^\n#]+)/gm)) {
        for (const part of match[1].split(",")) {
          const specifier = part.trim().split(/\s+/)[0];
          if (specifier) found.push({ index: match.index, specifier, typeOnly: false });
        }
      }
      return found;
    },
    resolve({ root, fromFile, specifier, sourceRoots }) {
      const dots = /^\.*/.exec(specifier)?.[0].length ?? 0;
      const modulePath = specifier.slice(dots).split(".").filter(Boolean).join("/");
      const bases = dots
        ? [resolve(root, dirname(fromFile), "../".repeat(dots - 1), modulePath)]
        : sourceRoots.map((sourceRoot) => resolve(root, sourceRoot, modulePath));
      return firstFile(
        root,
        bases.flatMap((base) => [`${base}.py`, join(base, "__init__.py")]),
      );
    },
    isBuiltin: (specifier) => PY_BUILTINS.has(specifier.split(".")[0]),
    packageName: (specifier) => specifier.split(".")[0],
  },
} satisfies Record<string, Language>;
const LANGUAGE_BY_NAME = new Map<string, Language>(Object.entries(LANGUAGES));

// ---------------------------------------------------------------- shared helpers

interface ImportRecord {
  line: number;
  specifier: string;
  typeOnly: boolean;
  target: string;
  file?: string;
}

interface Entrypoint {
  group: string;
  method: string;
  path: string;
  file: string;
  line: number;
}

interface Cycle {
  layers: [string, string];
  examples: { file: string; line: number; specifier: string }[];
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".turbo",
  ".next",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  "coverage",
]);

function fail(problems: string[]): never {
  for (const problem of problems) console.error(`scan: ${problem}`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const args = { config: "architecture.config.json", entry: "", json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--config") args.config = argv[++i] ?? args.config;
    else if (arg === "--entry") args.entry = argv[++i] ?? "";
    else if (arg === "--json") args.json = true;
    else fail([`unknown argument "${arg}". Use --config <file>, --entry <text>, --json.`]);
  }
  return args;
}

function loadConfig(configPath: string): Config {
  if (!existsSync(configPath)) fail([`config not found: ${configPath}`]);
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    return fail([`config is not valid JSON: ${error instanceof Error ? error.message : error}`]);
  }
}

// `rules` and `exceptions` belong to the lint, which checks them. The scanner ignores them.
const FIELDS = {
  config: ["$schema", "root", "scanner", "languages", "sourceRoots", "include", "ignore", "entrypoints", "layers", "rules", "exceptions"],
  layer: ["name", "files", "specifiers", "mayImport"],
  entrypoint: ["name", "files", "route", "mount"],
};

// A config mistake must not pass silently: a misspelled field or layer name
// would drop files from a layer without any sign.
function validateConfig(config: Config) {
  const problems: string[] = [];
  const unknownFields = (value: object, known: string[], where: string) => {
    for (const key of Object.keys(value)) {
      if (!known.includes(key)) problems.push(`${where}: unknown field "${key}"`);
    }
  };
  unknownFields(config, FIELDS.config, "config");
  for (const key of ["layers", "entrypoints"] as const) {
    if (!Array.isArray(config[key])) problems.push(`config: "${key}" must be an array`);
  }
  if (problems.length) fail(problems);

  const layerNames = new Set(config.layers.map((layer) => layer.name));
  config.layers.forEach((layer, index) => {
    const where = `layers[${index}] (${layer.name})`;
    unknownFields(layer, FIELDS.layer, where);
    for (const name of layer.mayImport ?? []) {
      if (!layerNames.has(name)) problems.push(`${where}: mayImport names unknown layer "${name}"`);
    }
  });
  config.entrypoints.forEach((group, index) =>
    unknownFields(group, FIELDS.entrypoint, `entrypoints[${index}] (${group.name})`),
  );
  if (problems.length) fail(problems);
}

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
      out += `(?:${glob.slice(i + 1, end).split(",").map(globBody).join("|")})`;
      i = end;
    } else out += ch.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return out;
}

function matcher(globs: string[] = []) {
  const patterns = globs.map((glob) => new RegExp(`^${globBody(glob)}$`));
  return (file: string) => patterns.some((pattern) => pattern.test(file));
}

function toPosix(path: string) {
  return path.split(sep).join("/");
}

function lineAt(text: string, index: number) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function walk(root: string, extensions: string[], include: (f: string) => boolean, ignore: (f: string) => boolean) {
  const files: string[] = [];
  const packages = new Set<string>();
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(join(dir, entry.name));
        continue;
      }
      const rel = toPosix(relative(root, join(dir, entry.name)));
      if (entry.name === "package.json") {
        try {
          const manifest: { name?: string } = JSON.parse(
            readFileSync(join(dir, entry.name), "utf8"),
          );
          if (manifest.name) packages.add(manifest.name);
        } catch {
          // Not a valid manifest. Skip it.
        }
      }
      if (!extensions.some((ext) => entry.name.endsWith(ext))) continue;
      if (include(rel) && !ignore(rel)) files.push(rel);
    }
  };
  visit(root);
  return { files: files.sort(), packages };
}

// ---------------------------------------------------------------- scan

function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = resolve(args.config);
  const config = loadConfig(configPath);
  validateConfig(config);
  const root = resolve(dirname(configPath), config.root ?? ".");
  const sourceRoots = config.sourceRoots ?? ["."];
  const languages = (config.languages ?? Object.keys(LANGUAGES)).map((name) => {
    const language = LANGUAGE_BY_NAME.get(name);
    if (!language) throw new Error(`Unknown language "${name}". Add it to LANGUAGES in scan.ts.`);
    return language;
  });
  const languageOf = (file: string) =>
    languages.find((language) => language.extensions.some((ext) => file.endsWith(ext)));

  const { files, packages } = walk(
    root,
    languages.flatMap((language) => language.extensions),
    matcher(config.include ?? ["**/*"]),
    matcher(config.ignore ?? []),
  );
  const fileSet = new Set(files);

  const layerMatchers = config.layers.map((layer) => ({
    name: layer.name,
    files: matcher(layer.files),
    specifiers: (layer.specifiers ?? []).map((pattern) => new RegExp(pattern)),
  }));
  const layerOf = (file: string) => layerMatchers.find((layer) => layer.files(file))?.name;

  function classify(language: Language, fromFile: string, specifier: string) {
    const file = language.resolve({ root, fromFile, specifier, sourceRoots });
    if (file) return { specifier, file, target: layerOf(file) ?? "unlayered" };
    const bySpecifier = layerMatchers.find((layer) =>
      layer.specifiers.some((pattern) => pattern.test(specifier)),
    );
    if (bySpecifier) return { specifier, target: bySpecifier.name };
    if (specifier.startsWith(".")) return { specifier, target: "unresolved" };
    if (language.isBuiltin(specifier)) return { specifier, target: "builtin" };
    const name = language.packageName(specifier);
    return { specifier, target: packages.has(name) ? `pkg:${name}` : `3p:${name}` };
  }

  const sources = new Map<string, string>();
  const imports = new Map<string, ImportRecord[]>();
  for (const file of files) {
    const language = languageOf(file);
    if (!language) continue;
    const text = readFileSync(join(root, file), "utf8");
    sources.set(file, text);
    imports.set(
      file,
      language
        .parseImports(text)
        .sort((a, b) => a.index - b.index)
        .map((item) => ({
          line: lineAt(text, item.index),
          typeOnly: item.typeOnly,
          ...classify(language, file, item.specifier),
        })),
    );
  }

  // Entrypoints. A mount links a prefix to a name (factory, router variable,
  // controller class). A route file gets the prefix when it defines that name.
  // Mounts found in the route file itself win, because names such as `router`
  // repeat across files.
  const entrypoints: Entrypoint[] = [];
  for (const group of config.entrypoints) {
    const mounts: { prefix: string; name: string; file: string }[] = [];
    if (group.mount) {
      const pattern = new RegExp(group.mount.pattern, "g");
      for (const file of files.filter(matcher(group.mount.files))) {
        for (const match of (sources.get(file) ?? "").matchAll(pattern)) {
          const prefix = match.groups?.prefix ?? "";
          const factory = match.groups?.factory;
          if (factory) mounts.push({ prefix, name: factory, file });
        }
      }
    }
    const routePattern = new RegExp(group.route, "g");
    for (const file of files.filter(matcher(group.files))) {
      const text = sources.get(file) ?? "";
      const defined = mounts.filter(({ name }) =>
        new RegExp(
          `\\b(?:function|const|let|var|def|class|func)\\s+${escapeRegExp(name)}\\b|^\\s*${escapeRegExp(name)}\\s*=`,
          "m",
        ).test(text),
      );
      const local = defined.filter((mount) => mount.file === file);
      const prefixes = (local.length ? local : defined).map(({ prefix }) => prefix);
      for (const match of text.matchAll(routePattern)) {
        const method = (match.groups?.method ?? "ANY").toUpperCase();
        const routePath = match.groups?.path ?? "";
        const line = lineAt(text, match.index);
        const unmounted = Boolean(group.mount) && prefixes.length === 0;
        for (const prefix of prefixes.length ? prefixes : [""]) {
          const full = `/${prefix}/${routePath}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
          entrypoints.push({
            group: group.name,
            method,
            path: unmounted ? `(unmounted) ${full}` : full,
            file,
            line,
          });
        }
      }
    }
  }

  // Focus: entrypoints matching --entry, and files reachable from their files.
  const selected = args.entry
    ? entrypoints.filter((entry) => `${entry.method} ${entry.path} ${entry.file}`.includes(args.entry))
    : entrypoints;
  let inScope = (_file: string) => true;
  if (args.entry) {
    const reachable = new Set<string>();
    const queue = [...new Set(selected.map((entry) => entry.file))];
    for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
      if (reachable.has(file)) continue;
      reachable.add(file);
      for (const record of imports.get(file) ?? []) {
        if (record.file && fileSet.has(record.file)) queue.push(record.file);
      }
    }
    inScope = (file) => reachable.has(file);
  }

  // Layer dependency matrix.
  type Cell = { runtime: number; type: number; example: { file: string; line: number; specifier: string } };
  const matrix = new Map<string, Map<string, Cell>>();
  const unlayered = new Map<string, number>();
  for (const [file, records] of imports) {
    const from = layerOf(file);
    if (!from || !inScope(file)) continue;
    for (const record of records) {
      if (record.target === "unlayered" && record.file) {
        unlayered.set(record.file, (unlayered.get(record.file) ?? 0) + 1);
      }
      if (record.target === from) continue;
      const row = matrix.get(from) ?? new Map<string, Cell>();
      matrix.set(from, row);
      const cell = row.get(record.target) ?? {
        runtime: 0,
        type: 0,
        example: { file, line: record.line, specifier: record.specifier },
      };
      if (record.typeOnly) cell.type++;
      else cell.runtime++;
      row.set(record.target, cell);
    }
  }

  // Two-layer cycles: runtime imports in both directions. The lint checks
  // `mayImport` per import; a cycle between layers without `mayImport` shows here only.
  const cycles: Cycle[] = [];
  for (const [a, row] of matrix) {
    for (const [b, ab] of row) {
      const ba = matrix.get(b)?.get(a);
      if (a >= b || !ab.runtime || !ba?.runtime) continue;
      cycles.push({ layers: [a, b], examples: [ab.example, ba.example] });
    }
  }

  const layerCounts = Object.fromEntries(
    config.layers.map((layer) => [
      layer.name,
      files.filter((file) => layerOf(file) === layer.name && inScope(file)).length,
    ]),
  );
  const dependencies = Object.fromEntries(
    [...matrix].map(([from, row]) => [
      from,
      Object.fromEntries([...row].map(([to, cell]) => [to, { runtime: cell.runtime, type: cell.type }])),
    ]),
  );
  const configLabel = toPosix(relative(process.cwd(), configPath));

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          config: configLabel,
          files: files.length,
          layers: layerCounts,
          unlayered: Object.fromEntries(unlayered),
          dependencies,
          cycles,
          entrypoints: selected,
        },
        null,
        2,
      ),
    );
    return;
  }

  const out: string[] = ["# Architecture scan", ""];
  out.push(
    `Config: ${configLabel} | Files: ${files.length} | Entrypoints: ${selected.length} | Cycles: ${cycles.length}${args.entry ? ` | Focus: "${args.entry}"` : ""}`,
    "",
    "## Layers",
    "",
    "| Layer | Files |",
    "| --- | --- |",
  );
  for (const [name, count] of Object.entries(layerCounts)) out.push(`| ${name} | ${count} |`);
  if (unlayered.size) {
    out.push("", "Unlayered files imported by layered code (add them to a layer):");
    for (const [file, count] of [...unlayered].sort((a, b) => b[1] - a[1])) {
      out.push(`- ${file} (${count} imports)`);
    }
  }
  out.push("", "## Layer dependencies", "", "```text");
  for (const [from, row] of matrix) {
    const cells = [...row]
      .sort((a, b) => b[1].runtime + b[1].type - (a[1].runtime + a[1].type))
      .map(([to, cell]) =>
        cell.runtime
          ? `${to} (${cell.runtime}${cell.type ? ` +${cell.type} type` : ""})`
          : `${to} (${cell.type} type)`,
      );
    out.push(`${from} -> ${cells.join(", ")}`);
  }
  out.push("```");
  if (cycles.length) {
    out.push("", `## Cycles (${cycles.length})`, "");
    for (const { layers: [a, b], examples } of cycles) {
      const where = examples.map((e) => `${e.file}:L${e.line} (${e.specifier})`).join(" and ");
      out.push(`- ${a} <-> ${b}: ${where}`);
    }
  }
  out.push("", `## Entrypoints (${selected.length})`, "", "```text");
  const width = Math.max(0, ...selected.map((entry) => entry.method.length + entry.path.length + 1));
  for (const entry of [...selected].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  )) {
    out.push(`${`${entry.method} ${entry.path}`.padEnd(width)}  ${entry.file}:L${entry.line}`);
  }
  out.push("```");
  console.log(out.join("\n"));
}

main();
