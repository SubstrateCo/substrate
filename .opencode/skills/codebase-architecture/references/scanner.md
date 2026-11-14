# Scanner

The scanner is the only part of this skill that changes per codebase. Its job
is narrow:

- list the entrypoints;
- put files into layers;
- count the imports between layers, and list two-layer cycles.

The lint enforces the config `rules` (see "Lint rules" below). The agent
does the call-stack reasoning. The scanner tells it where to look.

You can use the reference scanner (`scripts/scan.ts`) with a config, extend
it, or replace it with any tool. Whatever you use, it must emit the contract
below.

## Output contract

The scanner prints Markdown by default, and JSON with `--json`. Both formats
have the same sections:

```jsonc
{
  "config": "architecture.config.json",
  "files": 360,                                  // files scanned
  "layers": { "route": 19, "service": 30 },      // files per layer
  "unlayered": { "src/util/x.ts": 3 },           // imported by layered code, but in no layer
  "dependencies": {                              // cross-layer import counts
    "route": { "service": { "runtime": 5, "type": 18 }, "3p:hono": { "runtime": 22, "type": 1 } }
  },
  "cycles": [                                    // runtime imports in both directions
    { "layers": ["route", "service"], "examples": [
      { "file": "src/invoices/routes.ts", "line": 3, "specifier": "./service" },
      { "file": "src/invoices/service.ts", "line": 5, "specifier": "./routes" } ] }
  ],
  "entrypoints": [
    { "group": "rest", "method": "GET", "path": "/api/invoices/:id", "file": "src/invoices/routes.ts", "line": 14 }
  ]
}
```

Import target labels:

| Label | Meaning |
| --- | --- |
| `<layer>` | A file or specifier that maps to a configured layer. |
| `unlayered` | An internal file in no layer. |
| `pkg:<name>` | A workspace package with no layer. |
| `3p:<name>` | A third-party package. |
| `builtin` | A language or runtime built-in. |
| `unresolved` | A relative import that did not resolve. |

## Config reference (`architecture.config.json`)

| Field | Purpose |
| --- | --- |
| `root` | Repository root, relative to the config file. Default `.`. |
| `scanner` | Optional. Path to a project scanner that replaces the reference script. Agents read this field. |
| `languages` | Adapters to load: `typescript`, `python`. Default: all. |
| `sourceRoots` | Roots for absolute module imports (Python `src`, Java `src/main/java`). Default `["."]`. |
| `include` / `ignore` | Globs for the files to scan. Supports `**`, `*`, `?`, and `{a,b}`. |
| `entrypoints[]` | `{ name, files, route, mount? }`. `route` is a regex with named groups `method` and `path`. The optional `mount: { files, pattern }` has named groups `prefix` and `factory`. |
| `layers[]` | `{ name, files, specifiers?, mayImport? }`. Order matters: the first matching layer wins, so put specific globs before broad ones. `specifiers` are regexes for package, namespace, or path-alias imports (`^@acme/db`, `^MyApp\\.Data`, `^@/db/`). `mayImport` lists the only other layers this layer may import. |
| `rules[]` | Read by the lint. See "Lint rules". |
| `exceptions[]` | `{ rule, files, reason }`. Read by the lint. Every exception needs a reason. |

The scanner checks its fields before it scans. It exits with code 2 and a
list of problems for an unknown field or an unknown layer name. The lint
checks `rules` and `exceptions` the same way when it loads, and fails the
run on an unknown field, layer, or rule ID, or an exception without a reason.

Layer direction (`mayImport`):

- Prefer `mayImport` to a rule that lists forbidden layers. A list of
  forbidden layers goes stale when you add a layer; an allowlist does not.
- The lint reports X3 for each import from a layer with `mayImport` to a
  configured layer that is not in the list. `[]` makes the layer a leaf.
- It checks layer targets only, and it counts type-only imports. Use rules
  for third-party packages. Use an exception for a deliberate edge.
- Set it first on the layers at the bottom (database, contracts). Leave it
  off the composition layer.

## Lint rules

The architecture lint (`tooling/architecture-lint` in this repository)
reads `layers`, `rules`, and `exceptions` from the same config. It puts
files into layers exactly as the scanner does. `architecture/layer-imports`
checks `mayImport` (X3) and `forbidImports`. `architecture/layer-syntax`
checks the call, constructor, member, and syntax fields. Findings read
`[<rule>] <message>. <fix>.`

Rule fields:

- `layer`: one layer name, or a list of names.
- `forbidImports`: each entry is either an exact target label (`database`,
  `3p:drizzle-orm`) or a `/regex/`. A regex entry matches if it matches the
  target label or the raw specifier. To build an allowlist, use a negative
  lookahead: `/^3p:(?!hono$|zod$)/` forbids every vendor except those two.
- `allowTypeOnly`: skip `import type` and other type-only imports. Type
  imports often point upward legitimately, for example a route that imports
  a service type.
- `forbidCalls`: callee paths, such as `c.req.json`. In a path, `*` matches
  one name, `**` matches any run of names, and `{a,b}` matches either. A
  base that is not a name, such as a call result, is `()`:
  `z.object({}).parse` is `().parse`, which `**.parse` matches.
- `forbidNew`: constructor paths, such as `Response`.
- `forbidMembers`: member paths, such as `repositories.*`. Each link of a
  chain is checked, so `repositories.*` matches `repositories.tasks` in
  `repositories.tasks.list()`.
- `forbidSyntax`: ESTree node types, such as `CatchClause` or
  `ImportExpression`.
- `message` and `fix`: `{match}` is replaced with the import specifier or the
  matched path or node type, and `{target}` with the import target or the
  file's layer.

A rule needs at least one `forbid*` field. Strings and comments never match.
Prefer a narrow layer to a broad pattern: to allow a call in one directory,
give that directory its own layer (for example `renderer-queries`) and leave
it out of the rule.

Every config regex is a JSON string, so escape each backslash once: `\\.`,
`\\(`, `\\s`.

## Bootstrap a codebase

1. **Detect the stack.** Read the manifests (`package.json`, `pyproject.toml`,
   `go.mod`, `pom.xml`, `build.gradle`, `*.csproj`, `Gemfile`). Note the HTTP
   framework, the validator, the ORM, and the vendor SDKs.
2. **Read the declared rules.** Check `AGENTS.md`, `CONTRIBUTING.md`,
   architecture docs, and lint configs such as boundary or import rules.
   Encode those rules first.
3. **Find the entrypoints.** Grep for route declarations. Pick a recipe below
   and adjust it until the entrypoint count matches a rough
   `grep -c` of route declarations.
4. **Map the layers.** Use directory names and file naming (`*.controller.*`,
   `*service*`, `*repository*`, `models/`, `db/`). Start from
   `assets/architecture.config.example.json`. Put the composition root (app
   wiring, `main`) in its own layer, and do the same for config, so that they
   do not create false cycles.
5. **Run and tune.**
   - Shrink the unlayered list.
   - Check the dependency matrix for edges that make no sense. These often
     come from a misclassified shared file.
   - Turn broad vendor rules into allowlists.
   - Set `mayImport` on the bottom layers.
   - Add exceptions, with reasons, for patterns that are deliberate.
6. **Confirm with the user.** Show the layer table, the matrix, and the
   counts. Then commit the config.

## Extend the reference scanner

Copy `scripts/scan.ts` into the repository (for example
`scripts/architecture/scan.ts`) when you need code changes. Then set
`"scanner"` in the config. Keep the output contract.

### Add a language

Add an entry to `LANGUAGES` in `scan.ts`. An adapter needs these members:

| Member | What it does |
| --- | --- |
| `extensions` | The file extensions to scan. |
| `parseImports(text)` | Returns `{ index, specifier, typeOnly }[]`. |
| `resolve({ root, fromFile, specifier, sourceRoots })` | Returns a repo-relative file for internal imports, or `undefined`. |
| `isBuiltin(specifier)` | True for the standard library. |
| `packageName(specifier)` | The package to report as `3p:<name>`. |

Go sketch. Go imports packages, which are directories, so resolve to any file
in the directory:

```ts
go: {
  extensions: [".go"],
  parseImports(text) {
    const found = [];
    for (const m of text.matchAll(/^import\s+(?:\w+\s+)?"([^"]+)"/gm))
      found.push({ index: m.index, specifier: m[1], typeOnly: false });
    for (const block of text.matchAll(/^import\s*\(([\s\S]*?)\)/gm))
      for (const m of block[1].matchAll(/"([^"]+)"/g))
        found.push({ index: block.index + m.index, specifier: m[1], typeOnly: false });
    return found;
  },
  resolve({ root, specifier }) {
    const module = /^module\s+(\S+)/m.exec(readFileSync(join(root, "go.mod"), "utf8"))?.[1];
    if (!module || !specifier.startsWith(module)) return undefined;
    const dir = join(root, specifier.slice(module.length));
    const file = existsSync(dir) && readdirSync(dir).find((f) => f.endsWith(".go") && !f.endsWith("_test.go"));
    return file ? toPosix(relative(root, join(dir, file))) : undefined;
  },
  isBuiltin: (s) => !s.split("/")[0].includes("."),
  packageName: (s) => s.split("/").slice(0, 3).join("/"),
},
```

Languages without file-based imports:

- **Java and Kotlin:** parse `^import\s+([\w.]+)`. Resolve against
  `sourceRoots` by turning dots into slashes. You can also skip resolution
  and map layers by package with `specifiers: ["^com\\.acme\\.data\\."]`.
- **C#:** parse `^using\s+([\w.]+);`. Namespaces do not map to files, so
  classify layers only by `specifiers`.
- **Ruby/Rails:** autoloading hides imports, so the matrix stays empty. Map
  layers by directory and find model calls in controllers in the read pass,
  or with the stack's own lint (RuboCop).

### Entrypoint recipes

These are raw regexes. Escape them for JSON. In the table, `\|` is the
Markdown escape for `|`. Write a plain `|` in the config.

| Framework | `route` | `mount` |
| --- | --- | --- |
| Express, Hono, Koa-router, Elysia | `\.(?<method>get\|post\|put\|patch\|delete)\(\s*["'`](?<path>[^"'`]*)["'`]` | Express `app\.use\(\s*["'](?<prefix>[^"']+)["']\s*,\s*(?<factory>\w+)`. Hono `\.route\(\s*["'](?<prefix>[^"']+)["']\s*,\s*(?<factory>\w+)` |
| Fastify | `\.(?<method>get\|post\|put\|patch\|delete)\(\s*["'](?<path>[^"']*)["']` | `register\(\s*(?<factory>\w+)\s*,\s*\{\s*prefix:\s*["'](?<prefix>[^"']+)` |
| NestJS | `@(?<method>Get\|Post\|Put\|Patch\|Delete)\(\s*(?:["'](?<path>[^"']*)["'])?\s*\)` | Same files: `@Controller\(\s*["'](?<prefix>[^"']*)["']\s*\)\s*export\s+class\s+(?<factory>\w+)` |
| FastAPI | `@\w+\.(?<method>get\|post\|put\|patch\|delete)\(\s*["'](?<path>[^"']*)["']` | Same files: `(?<factory>\w+)\s*=\s*APIRouter\([^)]*prefix\s*=\s*["'](?<prefix>[^"']+)` |
| Flask | `@\w+\.(?<method>get\|post\|put\|patch\|delete\|route)\(\s*["'](?<path>[^"']*)["']` | Same files: `(?<factory>\w+)\s*=\s*Blueprint\([^)]*url_prefix\s*=\s*["'](?<prefix>[^"']+)` |
| Django | `path\(\s*["'](?<path>[^"']*)["']` (method is ANY) | `include()` chains: let the agent resolve them |
| Spring | `@(?<method>Get\|Post\|Put\|Patch\|Delete)Mapping\(\s*(?:value\s*=\s*)?["'](?<path>[^"']*)["']` | Same files: `@RequestMapping\(\s*["'](?<prefix>[^"']*)["']\s*\)[\s\S]{0,200}?class\s+(?<factory>\w+)` |
| Go (chi, gin, echo) | `\.(?<method>GET\|POST\|PUT\|PATCH\|DELETE\|Get\|Post\|Put\|Patch\|Delete)\(\s*"(?<path>[^"]*)"` | `\.(?:Route\|Group)\(\s*"(?<prefix>[^"]+)"\s*,\s*(?<factory>\w+)` |
| Rails | In `config/routes.rb`: `^\s*(?<method>get\|post\|put\|patch\|delete)\s+["'](?<path>[^"']+)` | `resources` and `namespace`: let the agent resolve them |

- If a mount is in the route file itself, it wins over mounts found in
  other files.
- With a `mount` configured, a route whose file has no matching mount is
  listed as `(unmounted)`. Resolve it by hand.
- File-based routers (Next.js `app/**/route.ts`, SvelteKit, Remix) take
  their path from the file path. Match the exported handler (for example
  `export\s+(?:async\s+)?function\s+(?<method>GET|POST|PUT|PATCH|DELETE)\b`),
  then derive the path from the file name while you trace.

### Other entrypoints

REST comes first. Later entrypoint kinds use the same config shape, with
another `entrypoints[]` group:

| Kind | What to match |
| --- | --- |
| Queue consumers | `subscribe("topic"`, `@Processor` |
| Cron jobs | `cron.schedule(`, `@Cron(` |
| RPC or MCP tools | tool registry entries |
| CLI commands | the command declarations |

Use `method` for the kind (for example `JOB`, `TOOL`) and `path` for the
name.

## Known limits of the reference scanner

- Imports are found with regex, not a parser. String-built dynamic imports
  are missed.
- `--entry` follows only imports that resolve to files. When a layer is
  reached through a package specifier (`@acme/db`), its files are not added
  to the focus set. Trace into them by hand.
- Path aliases (`@/db/x`, `~/x`) are not read from `tsconfig.json`. An
  aliased import is labelled `3p:` unless a layer's `specifiers` matches it.
- Workspace packages are found through `package.json` names only. In other
  ecosystems, an internal package is labelled `3p:` unless a layer's
  `specifiers` matches it.
- X1 finds cycles between two layers. It does not find a cycle across three
  or more.
- No call graph. The scanner says which files talk; the agent decides which
  calls cross layers.

## When to use a dedicated tool

This repository enforces the config rules with `tooling/architecture-lint`
in `bun run lint`. In a codebase without it, enforce the import rules in CI
with a tool for the stack:

| Stack | Tool |
| --- | --- |
| JS/TS | dependency-cruiser, eslint-plugin-boundaries |
| Python | import-linter |
| Java/Kotlin | ArchUnit |
| Go | go-arch-lint, depguard |
| .NET | NetArchTest |
| Ruby | packwerk |

Keep this skill for the parts those tools cannot do: tracing call stacks,
judging the read-only rules, and planning fixes. To feed one of these tools
into this skill, convert its output to the contract.
