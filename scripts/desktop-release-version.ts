export type ReleaseBump = "patch" | "minor" | "major";

// The workflow input is untrusted text until this boundary validates it.
// oxlint-disable-next-line deslop/prefer-literal-union
export function parseReleaseBump(value: string): ReleaseBump {
  switch (value) {
    case "patch":
    case "minor":
    case "major":
      return value;
    default:
      throw new Error(`Unknown release bump: ${value}`);
  }
}

export function nextDesktopVersion(current: string, bump: ReleaseBump): string {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(current)) {
    throw new Error(`Expected a stable app version, got: ${current}`);
  }
  // SAFETY: The regex above requires exactly three numeric components.
  const [major, minor, patch] = current.split(".").map(Number) as [number, number, number];
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    throw new Error(`App version exceeds the safe integer range: ${current}`);
  }
  let parts: number[];
  switch (bump) {
    case "patch":
      parts = [major, minor, patch + 1];
      break;
    case "minor":
      parts = [major, minor + 1, 0];
      break;
    case "major":
      parts = [major + 1, 0, 0];
      break;
    default:
      throw new Error("Unknown release bump");
  }
  if (!parts.every(Number.isSafeInteger)) {
    throw new Error("Next app version exceeds the safe integer range");
  }
  return parts.join(".");
}
