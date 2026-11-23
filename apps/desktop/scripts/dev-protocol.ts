import { desktopIdentity } from "@substrate/contracts/desktop/identity";

import { dirname, join } from "node:path";
import { z } from "zod";

const bundleInfo = z.looseObject({
  CFBundleIdentifier: z.string(),
  CFBundleURLTypes: z
    .array(
      z.looseObject({
        CFBundleURLSchemes: z.array(z.string()),
      }),
    )
    .optional(),
});

type MacBundleInfo = z.output<typeof bundleInfo>;

export function developmentBundleInfo<T extends MacBundleInfo>(info: T) {
  const identity = desktopIdentity(false);
  return {
    ...info,
    CFBundleIdentifier: identity.appId,
    CFBundleName: identity.name,
    CFBundleDisplayName: identity.name,
    CFBundleURLTypes: [
      ...(info.CFBundleURLTypes ?? []).flatMap((entry) => {
        if (!entry.CFBundleURLSchemes.includes(identity.scheme)) return [entry];
        const remaining = entry.CFBundleURLSchemes.filter((scheme) => scheme !== identity.scheme);
        return remaining.length ? [{ ...entry, CFBundleURLSchemes: remaining }] : [];
      }),
      { CFBundleURLName: identity.appId, CFBundleURLSchemes: [identity.scheme] },
    ],
  };
}

/** macOS resolves schemes by bundle ID, not the executable arguments used on Windows. */
export function prepareDevelopmentProtocol(executable: string) {
  if (process.platform !== "darwin") return;
  const contents = dirname(dirname(executable));
  const plist = join(contents, "Info.plist");
  const read = Bun.spawnSync(["/usr/bin/plutil", "-convert", "json", "-o", "-", plist]);
  if (read.exitCode !== 0) throw new Error("Could not read the development Electron bundle.");
  const input: unknown = JSON.parse(read.stdout.toString());
  const original = bundleInfo.parse(input);
  const updated = developmentBundleInfo(original);
  if (JSON.stringify(original) !== JSON.stringify(updated)) {
    const write = Bun.spawnSync(["/usr/bin/plutil", "-convert", "xml1", "-o", plist, "-"], {
      stdin: Buffer.from(JSON.stringify(updated)),
    });
    if (write.exitCode !== 0)
      throw new Error("Could not configure the development Electron bundle.");
  }
  const register = Bun.spawnSync([
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
    "-f",
    dirname(contents),
  ]);
  if (register.exitCode !== 0)
    throw new Error("Could not register the development Electron bundle.");
}
