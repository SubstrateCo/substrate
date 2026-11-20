import { writeHarnessWorkerLoader } from "./harness-worker.ts";
import { stageInstalledPackages } from "./package-assets.ts";
import { afterEach, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const temporary = join(tmpdir(), "opencode");
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(join(temporary, "desktop-package-"));
  temporaryDirectories.push(root);
  const source = join(root, "source");
  const output = join(root, "staged", "node_modules");
  await mkdir(source);
  await writeFile(join(source, "package.json"), JSON.stringify({ type: "module" }));
  return { root, source, output };
}

interface Manifest {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional: boolean }>;
  exports?: Record<string, string>;
  main?: string;
}
async function installed(
  directory: string,
  name: string,
  manifest: Manifest = {},
  version = "1.0.0",
) {
  const path = join(directory, "node_modules", name);
  await mkdir(join(path, "lib"), { recursive: true });
  await writeFile(
    join(path, "package.json"),
    JSON.stringify({ name, version, main: "lib/index.js", ...manifest }),
  );
  await writeFile(join(path, "lib", "index.js"), "module.exports = {};\n");
  return path;
}
async function asset(directory: string, path: string, content: string | Uint8Array) {
  const target = join(directory, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

test("stages scoped packages, dependency and peer graphs, and companion assets without undeclared node_modules", async () => {
  const f = await fixture();
  const sdk = await installed(f.source, "@scope/sdk", {
    exports: { ".": "./lib/index.js" },
    dependencies: { parser: "1" },
    peerDependencies: { protocol: "1" },
  });
  await installed(f.source, "parser");
  await installed(f.source, "protocol");
  await installed(sdk, "undeclared");
  await asset(sdk, "lib/package.json", JSON.stringify({ type: "commonjs" }));
  await asset(sdk, "cli.js", "cli asset");
  await asset(sdk, "native/engine.node", new Uint8Array([0, 255, 11]));
  await asset(sdk, "native/engine.wasm", new Uint8Array([0, 97, 115, 109]));
  const versions = await stageInstalledPackages({
    names: ["@scope/sdk"],
    fromDirectory: f.source,
    nodeModulesDirectory: f.output,
  });
  expect(versions).toEqual({ "@scope/sdk": "1.0.0" });
  const staged = join(f.output, "@scope/sdk");
  expect(await readFile(join(staged, "cli.js"), "utf8")).toBe("cli asset");
  expect(new Uint8Array(await readFile(join(staged, "native/engine.node")))).toEqual(
    new Uint8Array([0, 255, 11]),
  );
  expect(new Uint8Array(await readFile(join(staged, "native/engine.wasm")))).toEqual(
    new Uint8Array([0, 97, 115, 109]),
  );
  expect(JSON.parse(await readFile(join(f.output, "parser/package.json"), "utf8")).name).toBe(
    "parser",
  );
  expect(JSON.parse(await readFile(join(f.output, "protocol/package.json"), "utf8")).name).toBe(
    "protocol",
  );
  expect(access(join(staged, "node_modules/undeclared"))).rejects.toThrow();
});

test("cycles reuse the staged ancestor instead of recursively duplicating it", async () => {
  const f = await fixture();
  await installed(f.source, "alpha", { dependencies: { beta: "1" } });
  await installed(f.source, "beta", { dependencies: { alpha: "1" } });
  await stageInstalledPackages({
    names: ["alpha"],
    fromDirectory: f.source,
    nodeModulesDirectory: f.output,
  });
  const beta = join(f.output, "beta");
  expect(createRequire(join(beta, "package.json")).resolve("alpha/package.json")).toBe(
    join(f.output, "alpha/package.json"),
  );
  expect(access(join(beta, "node_modules/alpha"))).rejects.toThrow();
});

test("installed asset-only optional packages are included; missing optional packages and peers are skipped", async () => {
  const f = await fixture();
  const sdk = await installed(f.source, "sdk", {
    dependencies: { missing: "1" },
    optionalDependencies: { binary: "1", missing: "1" },
    peerDependencies: { absentPeer: "1" },
    peerDependenciesMeta: { absentPeer: { optional: true } },
  });
  const binary = await installed(sdk, "binary", { exports: {} });
  await asset(binary, "vendor/cli.exe", "native executable");
  await stageInstalledPackages({
    names: ["sdk"],
    fromDirectory: f.source,
    nodeModulesDirectory: f.output,
  });
  expect(await readFile(join(f.output, "binary/vendor/cli.exe"), "utf8")).toBe("native executable");
  expect(access(join(f.output, "missing"))).rejects.toThrow();
  expect(access(join(f.output, "absentPeer"))).rejects.toThrow();
});

test("excluded packages are skipped with their own dependencies while the rest of the graph is staged", async () => {
  const f = await fixture();
  const adapter = await installed(f.source, "adapter", {
    dependencies: { "bundled-cli": "1", sdk: "1" },
  });
  const cli = await installed(adapter, "bundled-cli", {
    optionalDependencies: { "bundled-cli-win32": "1" },
  });
  await asset(await installed(cli, "bundled-cli-win32"), "codex.exe", "native executable");
  const sdk = await installed(f.source, "sdk", {
    dependencies: { parser: "1" },
    optionalDependencies: { "sdk-win32": "1" },
  });
  await installed(f.source, "parser");
  await asset(await installed(sdk, "sdk-win32"), "claude.exe", "native executable");
  await stageInstalledPackages({
    names: ["adapter"],
    fromDirectory: f.source,
    nodeModulesDirectory: f.output,
    exclude: ["bundled-cli", "sdk-win32"],
  });
  const require = createRequire(join(f.output, "adapter", "package.json"));
  expect(require.resolve("sdk")).toBe(join(f.output, "sdk/lib/index.js"));
  expect(createRequire(require.resolve("sdk")).resolve("parser")).toBe(
    join(f.output, "parser/lib/index.js"),
  );
  for (const name of ["bundled-cli", "bundled-cli-win32", "sdk-win32"])
    expect(() => require.resolve(`${name}/package.json`)).toThrow();
});

test("an excluded top-level package fails staging rather than shipping without it", async () => {
  const f = await fixture();
  await installed(f.source, "adapter");
  expect(
    stageInstalledPackages({
      names: ["adapter"],
      fromDirectory: f.source,
      nodeModulesDirectory: f.output,
      exclude: ["adapter"],
    }),
  ).rejects.toThrow("Harness package is both staged and excluded: adapter.");
});

test("missing required dependencies and peers fail staging rather than shipping an incomplete graph", async () => {
  const f = await fixture();
  await installed(f.source, "sdk", { dependencies: { missing: "1" } });
  expect(
    stageInstalledPackages({
      names: ["sdk"],
      fromDirectory: f.source,
      nodeModulesDirectory: f.output,
    }),
  ).rejects.toThrow("Required harness dependency is not installed: missing");
  await installed(f.source, "peer-sdk", { peerDependencies: { missingPeer: "1" } });
  expect(
    stageInstalledPackages({
      names: ["peer-sdk"],
      fromDirectory: f.source,
      nodeModulesDirectory: f.output,
    }),
  ).rejects.toThrow("Required harness dependency is not installed: missingPeer");
});

test("different installed dependency versions keep separate package-relative layouts", async () => {
  const f = await fixture();
  const first = await installed(f.source, "first", { dependencies: { parser: "1" } });
  const second = await installed(f.source, "second", { dependencies: { parser: "2" } });
  await installed(first, "parser", {}, "1.2.0");
  await installed(second, "parser", {}, "2.3.0");
  await stageInstalledPackages({
    names: ["first", "second"],
    fromDirectory: f.source,
    nodeModulesDirectory: f.output,
  });
  expect(JSON.parse(await readFile(join(f.output, "parser/package.json"), "utf8")).version).toBe(
    "1.2.0",
  );
  expect(
    JSON.parse(await readFile(join(f.output, "second/node_modules/parser/package.json"), "utf8"))
      .version,
  ).toBe("2.3.0");
});

test("a shared dependency is copied once at the top level and conflicting versions stay nested", async () => {
  const f = await fixture();
  await installed(f.source, "nested", { dependencies: { shared: "1" } });
  await installed(f.source, "shared");
  const outer = await installed(f.source, "outer", {
    dependencies: { nested: "2", parser: "2", shared: "1" },
  });
  const nested = await installed(
    outer,
    "nested",
    { dependencies: { parser: "1", shared: "1" } },
    "2.0.0",
  );
  await installed(nested, "parser", {}, "1.0.0");
  await installed(outer, "parser", {}, "2.0.0");
  expect(
    await stageInstalledPackages({
      names: ["nested", "outer"],
      fromDirectory: f.source,
      nodeModulesDirectory: f.output,
    }),
  ).toEqual({ nested: "1.0.0", outer: "1.0.0" });
  const resolved = async (from: string, name: string) =>
    JSON.parse(
      await readFile(
        createRequire(join(f.output, from, "package.json")).resolve(`${name}/package.json`),
        "utf8",
      ),
    ).version;
  for (const path of ["nested/node_modules/shared", "outer/node_modules/shared"])
    expect(access(join(f.output, path))).rejects.toThrow();
  for (const from of ["nested", "outer", "outer/node_modules/nested"])
    expect(await resolved(from, "shared")).toBe("1.0.0");
  expect(await resolved("outer", "nested")).toBe("2.0.0");
  // The nested copy keeps parser 1.x even though its parent hoisted parser 2.x.
  expect(await resolved("outer", "parser")).toBe("2.0.0");
  expect(await resolved("outer/node_modules/nested", "parser")).toBe("1.0.0");
});

test("worker bootstrap loads the unpacked entry rather than an ASAR virtual path", async () => {
  const f = await fixture();
  const archive = join(f.root, "app.asar");
  const unpacked = join(f.root, "app.asar.unpacked");
  await mkdir(archive);
  await mkdir(unpacked);
  await writeHarnessWorkerLoader(archive);
  await asset(archive, "harness-worker-entry.mjs", 'throw new Error("Loaded virtual worker");');
  const marker = join(f.root, "worker-entry.txt");
  await asset(
    unpacked,
    "harness-worker-entry.mjs",
    `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, import.meta.url);`,
  );
  await import(pathToFileURL(join(archive, "harness-worker.js")).href);
  expect(await readFile(marker, "utf8")).toBe(
    pathToFileURL(join(unpacked, "harness-worker-entry.mjs")).href,
  );
});

test("development worker bootstrap keeps its normal filesystem entry", async () => {
  const f = await fixture();
  await writeHarnessWorkerLoader(f.source);
  const marker = join(f.root, "development-entry.txt");
  await asset(
    f.source,
    "harness-worker-entry.mjs",
    `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, import.meta.url);`,
  );
  await import(pathToFileURL(join(f.source, "harness-worker.js")).href);
  expect(await readFile(marker, "utf8")).toBe(
    pathToFileURL(join(f.source, "harness-worker-entry.mjs")).href,
  );
});
