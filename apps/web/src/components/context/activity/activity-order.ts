type TimedActivity = { id: string; createdAt: string };

export function orderActivity<T extends TimedActivity>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const time = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (time !== 0) return time;
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  });
}
