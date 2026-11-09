const units: [string, number][] = [
  ["d", 86_400_000],
  ["h", 3_600_000],
  ["m", 60_000],
];

/** Compact event time: "now", "5m", "3h", "6d", then a short date. */
export function shortActivityTime(value: string, now = Date.now()) {
  const date = new Date(value);
  const elapsed = now - date.getTime();
  if (elapsed < 7 * 86_400_000) {
    for (const [unit, size] of units)
      if (elapsed >= size) return `${Math.floor(elapsed / size)}${unit}`;
    return "now";
  }
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}
