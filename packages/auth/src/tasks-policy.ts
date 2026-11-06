export function requireTasksWorkspace(expected: string, active: string | null | undefined) {
  if (!active || active !== expected)
    throw new Error("Your active workspace changed. Reload this page to continue.");
  return active;
}

export function requireTasksOrigin(origin: string | null, baseURL: string) {
  if (!origin || origin !== new URL(baseURL).origin) throw new Error("Invalid request origin.");
}
